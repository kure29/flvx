package socket

import (
	"os"
	"path/filepath"
	"strings"
	"syscall"
	"testing"
)

// fakeProcSys builds a /proc/sys stand-in holding every tunable key (minus
// skip) at a stock value, and points the tuning paths at it.
func fakeProcSys(t *testing.T, available string, skip ...string) string {
	t.Helper()
	dir := t.TempDir()
	oldProc, oldConf, oldBackup, oldModprobe := tuneProcRoot, tuneConfPath, tuneBackupPath, tuneModprobe
	tuneProcRoot = filepath.Join(dir, "proc")
	tuneConfPath = filepath.Join(dir, "sysctl.d", "99-flyx-tuning.conf")
	tuneBackupPath = filepath.Join(dir, "agent", "tuning-backup.json")
	tuneModprobe = func(string) error { return nil }
	t.Cleanup(func() {
		tuneProcRoot, tuneConfPath, tuneBackupPath, tuneModprobe = oldProc, oldConf, oldBackup, oldModprobe
	})
	_ = os.MkdirAll(filepath.Dir(tuneConfPath), 0o755)

	skipped := map[string]bool{}
	for _, k := range skip {
		skipped[k] = true
	}
	write := func(key, value string) {
		p := sysctlPath(key)
		_ = os.MkdirAll(filepath.Dir(p), 0o755)
		if err := os.WriteFile(p, []byte(value+"\n"), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	for _, g := range tuneGroups {
		for _, s := range g.Settings {
			if !skipped[s.Key] {
				write(s.Key, "0")
			}
		}
	}
	write("net.ipv4.tcp_congestion_control", "cubic")
	write("net.ipv4.tcp_available_congestion_control", available)
	write("net.ipv4.tcp_rmem", "4096\t131072\t6291456")
	write("kernel.osrelease", "6.1.0-test")
	return dir
}

func TestTuneApplyAndRestore(t *testing.T) {
	fakeProcSys(t, "reno cubic bbr", "net.netfilter.nf_conntrack_max")

	st, err := applyTuning([]string{"bbr", "buffer", "backlog"})
	if err != nil {
		t.Fatal(err)
	}
	if v, _ := readSysctl("net.ipv4.tcp_congestion_control"); v != "bbr" {
		t.Fatalf("congestion: %q", v)
	}
	if v, _ := readSysctl("net.ipv4.tcp_rmem"); v != "4096 131072 67108864" {
		t.Fatalf("tcp_rmem: %q", v)
	}
	conf, _ := os.ReadFile(tuneConfPath)
	if !strings.Contains(string(conf), "net.ipv4.tcp_congestion_control = bbr") || strings.Contains(string(conf), "nf_conntrack_max") {
		t.Fatalf("conf:\n%s", conf)
	}
	applied := map[string]bool{}
	for _, g := range st.Groups {
		applied[g.ID] = g.Applied
	}
	if !applied["bbr"] || !applied["buffer"] || !applied["backlog"] || applied["tcp"] || !st.HasBackup {
		t.Fatalf("status: %+v", st)
	}

	// Unchecking a group puts its keys back; the rest stay tuned.
	if _, err := applyTuning([]string{"buffer"}); err != nil {
		t.Fatal(err)
	}
	if v, _ := readSysctl("net.ipv4.tcp_congestion_control"); v != "cubic" {
		t.Fatalf("bbr not restored: %q", v)
	}
	if v, _ := readSysctl("net.core.rmem_max"); v != "67108864" {
		t.Fatalf("buffer lost: %q", v)
	}

	// Restore puts back the values found before the first apply.
	st, err = applyTuning(nil)
	if err != nil {
		t.Fatal(err)
	}
	if v, _ := readSysctl("net.ipv4.tcp_rmem"); v != "4096 131072 6291456" {
		t.Fatalf("tcp_rmem not restored: %q", v)
	}
	if _, err := os.Stat(tuneConfPath); !os.IsNotExist(err) {
		t.Fatal("conf file left behind")
	}
	if _, err := os.Stat(tuneBackupPath); !os.IsNotExist(err) || st.HasBackup {
		t.Fatal("backup left behind")
	}
}

func TestTuneSkipsBBRWithoutKernelSupport(t *testing.T) {
	fakeProcSys(t, "reno cubic")
	st, err := applyTuning([]string{"bbr", "forward"})
	if err != nil {
		t.Fatal(err)
	}
	if v, _ := readSysctl("net.ipv4.tcp_congestion_control"); v != "cubic" {
		t.Fatalf("bbr set anyway: %q", v)
	}
	if v, _ := readSysctl("net.ipv4.ip_forward"); v != "1" {
		t.Fatalf("forward: %q", v)
	}
	if len(st.Warnings) != 1 || !strings.Contains(st.Warnings[0], "BBR") {
		t.Fatalf("warnings: %v", st.Warnings)
	}
}

func TestTuneCommandRejectsUnknownGroup(t *testing.T) {
	fakeProcSys(t, "cubic bbr")
	if _, err := handleTuneCommand("TuneApply", map[string]interface{}{"groups": []string{"rm-rf"}}); err == nil {
		t.Fatal("expected an error")
	}
	out, err := handleTuneCommand("TuneStatus", nil)
	if err != nil || out.(tuneStatus).Kernel != "6.1.0-test" || len(out.(tuneStatus).Groups) != len(tuneGroups) {
		t.Fatalf("status: %+v %v", out, err)
	}
}

func TestTuneNeverLowersLimits(t *testing.T) {
	fakeProcSys(t, "cubic bbr")
	_ = writeSysctl("fs.file-max", "9999999")
	_ = writeSysctl("net.ipv4.tcp_rmem", "4096 131072 134217728")

	st, err := applyTuning([]string{"files", "buffer"})
	if err != nil {
		t.Fatal(err)
	}
	if v, _ := readSysctl("fs.file-max"); v != "9999999" {
		t.Fatalf("file-max lowered to %q", v)
	}
	if v, _ := readSysctl("net.ipv4.tcp_rmem"); v != "4096 131072 134217728" {
		t.Fatalf("tcp_rmem lowered to %q", v)
	}
	if v, _ := readSysctl("fs.nr_open"); v != "1048576" {
		t.Fatalf("nr_open not raised: %q", v)
	}
	conf, _ := os.ReadFile(tuneConfPath)
	if strings.Contains(string(conf), "file-max") {
		t.Fatalf("conf pins a value the node already beat:\n%s", conf)
	}
	for _, g := range st.Groups {
		if g.ID == "files" && !g.Applied {
			t.Fatalf("files should count as applied: %+v", g)
		}
	}
	// Restoring leaves the untouched key alone.
	if _, err := applyTuning(nil); err != nil {
		t.Fatal(err)
	}
	if v, _ := readSysctl("fs.file-max"); v != "9999999" {
		t.Fatalf("file-max changed on restore: %q", v)
	}
}

func TestTuneLeavesFailedSettingsOutOfConf(t *testing.T) {
	fakeProcSys(t, "cubic bbr")
	// A kernel without the fq qdisc answers ENOENT when it is written.
	tuneWrite = func(key, value string) error {
		if key == "net.core.default_qdisc" {
			return &os.PathError{Op: "write", Path: key, Err: syscall.ENOENT}
		}
		return writeSysctl(key, value)
	}
	t.Cleanup(func() { tuneWrite = writeSysctl })

	st, err := applyTuning([]string{"bbr"})
	if err != nil {
		t.Fatal(err)
	}
	conf, _ := os.ReadFile(tuneConfPath)
	if strings.Contains(string(conf), "default_qdisc") || !strings.Contains(string(conf), "tcp_congestion_control = bbr") {
		t.Fatalf("conf:\n%s", conf)
	}
	if len(st.Warnings) != 1 || !strings.Contains(st.Warnings[0], "default_qdisc") {
		t.Fatalf("warnings: %v", st.Warnings)
	}
}
