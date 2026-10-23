package socket

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"syscall"
)

// Node network tuning (节点调优). TuneStatus reports the current kernel
// parameters next to the recommended ones; TuneApply writes the chosen
// groups to a sysctl.d file (so they survive reboots) and applies them now.
// The value each key had before the first apply is kept, so unchecking a
// group, or TuneApply with restore, puts the original value back.

type tuneSetting struct {
	Key   string
	Value string
	// AtLeast marks limits that are only ever raised: a node already above
	// the recommendation keeps its value (compared on the last number, so
	// "4096 131072 67108864" goes by its maximum).
	AtLeast bool
}

type tuneGroup struct {
	ID       string
	Name     string
	Desc     string
	Settings []tuneSetting
}

var tuneGroups = []tuneGroup{
	{"bbr", "BBR 拥塞控制", "高延迟、有丢包的线路上明显提速（需要内核 4.9+）", []tuneSetting{
		{"net.core.default_qdisc", "fq", false},
		{"net.ipv4.tcp_congestion_control", "bbr", false},
	}},
	{"buffer", "加大缓冲区", "跨境长距离线路单连接跑得更快", []tuneSetting{
		{"net.core.rmem_max", "67108864", true},
		{"net.core.wmem_max", "67108864", true},
		{"net.ipv4.tcp_rmem", "4096 131072 67108864", true},
		{"net.ipv4.tcp_wmem", "4096 65536 67108864", true},
		{"net.ipv4.udp_rmem_min", "16384", true},
		{"net.ipv4.udp_wmem_min", "16384", true},
	}},
	{"tcp", "TCP 连接优化", "开启 Fast Open、空闲后不降速、自动探测 MTU", []tuneSetting{
		{"net.ipv4.tcp_fastopen", "3", false},
		{"net.ipv4.tcp_slow_start_after_idle", "0", false},
		{"net.ipv4.tcp_mtu_probing", "1", false},
		{"net.ipv4.tcp_notsent_lowat", "16384", false},
		{"net.ipv4.tcp_fin_timeout", "30", false},
	}},
	{"backlog", "高并发队列", "连接多时不丢新连接", []tuneSetting{
		{"net.core.somaxconn", "32768", true},
		{"net.core.netdev_max_backlog", "16384", true},
		{"net.ipv4.tcp_max_syn_backlog", "16384", true},
		{"net.netfilter.nf_conntrack_max", "262144", true},
	}},
	{"forward", "IPv4 转发", "内核转发（nftables 端口转发）需要", []tuneSetting{
		{"net.ipv4.ip_forward", "1", false},
	}},
	{"files", "文件句柄上限", "系统允许打开更多连接和文件", []tuneSetting{
		{"fs.file-max", "1048576", true},
		{"fs.nr_open", "1048576", true},
	}},
}

// Paths are variables so tests can use a temporary tree.
var (
	tuneProcRoot   = "/proc/sys"
	tuneConfPath   = "/etc/sysctl.d/99-flyx-tuning.conf"
	tuneBackupPath = "/etc/flux_agent/tuning-backup.json"
	tuneModprobe   = func(module string) error { return exec.Command("modprobe", module).Run() }
	tuneWrite      = writeSysctl
)

type tuneSettingStatus struct {
	Key       string `json:"key"`
	Current   string `json:"current"`
	Target    string `json:"target"`
	Supported bool   `json:"supported"`
	OK        bool   `json:"ok"` // already meets the recommendation
}

type tuneGroupStatus struct {
	ID       string              `json:"id"`
	Name     string              `json:"name"`
	Desc     string              `json:"desc"`
	Applied  bool                `json:"applied"`
	Settings []tuneSettingStatus `json:"settings"`
}

type tuneStatus struct {
	Kernel     string            `json:"kernel"`
	Congestion string            `json:"congestion"`
	Available  string            `json:"available"`
	HasBackup  bool              `json:"hasBackup"`
	Groups     []tuneGroupStatus `json:"groups"`
	Warnings   []string          `json:"warnings,omitempty"`
}

func handleTuneCommand(cmdType string, data interface{}) (interface{}, error) {
	switch cmdType {
	case "TuneStatus":
		return readTuneStatus(), nil
	case "TuneApply":
		raw, err := json.Marshal(data)
		if err != nil {
			return nil, fmt.Errorf("序列化数据失败: %v", err)
		}
		var req struct {
			Groups  []string `json:"groups"`
			Restore bool     `json:"restore"`
		}
		if err := json.Unmarshal(raw, &req); err != nil {
			return nil, fmt.Errorf("解析调优参数失败: %v", err)
		}
		if req.Restore {
			req.Groups = nil
		}
		return applyTuning(req.Groups)
	}
	return nil, fmt.Errorf("未知命令类型: %s", cmdType)
}

func sysctlPath(key string) string {
	return filepath.Join(tuneProcRoot, strings.ReplaceAll(key, ".", "/"))
}

// satisfied reports whether cur already meets s.
func (s tuneSetting) satisfied(cur string) bool {
	if cur == s.Value {
		return true
	}
	if !s.AtLeast {
		return false
	}
	c, err1 := lastNumber(cur)
	t, err2 := lastNumber(s.Value)
	return err1 == nil && err2 == nil && c >= t
}

func lastNumber(v string) (uint64, error) {
	f := strings.Fields(v)
	if len(f) == 0 {
		return 0, fmt.Errorf("empty")
	}
	return strconv.ParseUint(f[len(f)-1], 10, 64)
}

func readSysctl(key string) (string, bool) {
	b, err := os.ReadFile(sysctlPath(key))
	if err != nil {
		return "", false
	}
	return strings.Join(strings.Fields(string(b)), " "), true
}

func writeSysctl(key, value string) error {
	return os.WriteFile(sysctlPath(key), []byte(value+"\n"), 0o644)
}

func readTuneStatus() tuneStatus {
	st := tuneStatus{}
	if b, err := os.ReadFile(filepath.Join(tuneProcRoot, "kernel/osrelease")); err == nil {
		st.Kernel = strings.TrimSpace(string(b))
	}
	st.Congestion, _ = readSysctl("net.ipv4.tcp_congestion_control")
	st.Available, _ = readSysctl("net.ipv4.tcp_available_congestion_control")
	_, err := os.Stat(tuneBackupPath)
	st.HasBackup = err == nil
	for _, g := range tuneGroups {
		gs := tuneGroupStatus{ID: g.ID, Name: g.Name, Desc: g.Desc, Applied: true}
		any := false
		for _, s := range g.Settings {
			cur, ok := readSysctl(s.Key)
			gs.Settings = append(gs.Settings, tuneSettingStatus{Key: s.Key, Current: cur, Target: s.Value, Supported: ok, OK: ok && s.satisfied(cur)})
			if ok {
				any = true
				if !s.satisfied(cur) {
					gs.Applied = false
				}
			}
		}
		gs.Applied = gs.Applied && any
		st.Groups = append(st.Groups, gs)
	}
	return st
}

func loadTuneBackup() map[string]string {
	backup := map[string]string{}
	if b, err := os.ReadFile(tuneBackupPath); err == nil {
		_ = json.Unmarshal(b, &backup)
	}
	return backup
}

// applyTuning makes the chosen groups the tuned set: their keys get the
// recommended values, keys tuned before but no longer chosen get their
// original value back. An empty choice restores everything.
func applyTuning(groupIDs []string) (tuneStatus, error) {
	chosen := map[string]bool{}
	for _, id := range groupIDs {
		found := false
		for _, g := range tuneGroups {
			if g.ID == id {
				found = true
			}
		}
		if !found {
			return tuneStatus{}, fmt.Errorf("未知调优项: %s", id)
		}
		chosen[id] = true
	}

	var warnings []string
	if InContainer() && len(chosen) > 0 {
		// /etc/sysctl.d is the container's, not the host's.
		warnings = append(warnings, "节点运行在 Docker 中：调优需要容器以 --privileged 运行，宿主机重启后需在面板重新应用")
	}
	if chosen["bbr"] {
		if avail, _ := readSysctl("net.ipv4.tcp_available_congestion_control"); !strings.Contains(" "+avail+" ", " bbr ") {
			_ = tuneModprobe("tcp_bbr")
			if avail, _ = readSysctl("net.ipv4.tcp_available_congestion_control"); !strings.Contains(" "+avail+" ", " bbr ") {
				warnings = append(warnings, "内核不支持 BBR（需要 4.9 以上并带 tcp_bbr 模块），已跳过")
				delete(chosen, "bbr")
			}
		}
	}

	backup := loadTuneBackup()
	want := map[string]string{}
	var confKeys []string
	for _, g := range tuneGroups {
		if !chosen[g.ID] {
			continue
		}
		for _, s := range g.Settings {
			cur, ok := readSysctl(s.Key)
			if !ok {
				continue // not on this kernel (e.g. conntrack not loaded)
			}
			_, saved := backup[s.Key]
			if !saved && s.AtLeast && s.satisfied(cur) {
				continue // already above the recommendation: leave it alone
			}
			if !saved {
				backup[s.Key] = cur
			}
			want[s.Key] = s.Value
			confKeys = append(confKeys, s.Key)
		}
	}

	keys := make([]string, 0, len(backup))
	for k := range backup {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	failed := map[string]bool{}
	for _, k := range keys {
		value, tuned := want[k]
		if !tuned {
			value = backup[k] // no longer chosen: back to the original
		}
		if err := tuneWrite(k, value); err != nil {
			if os.IsNotExist(err) || errors.Is(err, syscall.EINVAL) {
				warnings = append(warnings, fmt.Sprintf("%s 不支持 %s，已跳过", k, value))
			} else {
				warnings = append(warnings, fmt.Sprintf("%s 设置失败: %v", k, err))
			}
			if tuned {
				failed[k] = true
				delete(backup, k) // unchanged, nothing to restore
			}
			continue
		}
		if !tuned {
			delete(backup, k)
		}
	}

	// Only what took effect goes into the file applied at boot.
	var conf []string
	for _, k := range confKeys {
		if !failed[k] {
			conf = append(conf, k+" = "+want[k])
		}
	}
	if err := os.MkdirAll(filepath.Dir(tuneBackupPath), 0o755); err != nil {
		return tuneStatus{}, err
	}
	if len(conf) > 0 {
		body := "# Written by the FLYX panel (节点调优); remove via the panel to restore.\n" + strings.Join(conf, "\n") + "\n"
		if err := os.WriteFile(tuneConfPath, []byte(body), 0o644); err != nil {
			return tuneStatus{}, fmt.Errorf("写入 %s 失败: %v", tuneConfPath, err)
		}
	} else if err := os.Remove(tuneConfPath); err != nil && !os.IsNotExist(err) {
		return tuneStatus{}, err
	}

	if len(backup) > 0 {
		b, _ := json.MarshalIndent(backup, "", "  ")
		if err := os.WriteFile(tuneBackupPath, b, 0o600); err != nil {
			return tuneStatus{}, err
		}
	} else if err := os.Remove(tuneBackupPath); err != nil && !os.IsNotExist(err) {
		return tuneStatus{}, err
	}

	st := readTuneStatus()
	st.Warnings = warnings
	return st, nil
}
