package socket

import (
	"encoding/binary"
	"encoding/json"
	"fmt"
	"math/rand"
	"net"
	"strings"
	"sync"
	"time"

	"golang.org/x/net/icmp"
	"golang.org/x/net/ipv4"
)

const (
	tracerouteMaxHops     = 30
	tracerouteWait        = 3 * time.Second
	tracerouteRounds      = 2
	maxConcurrentTraces   = 4
	tracerouteICMPProtoV4 = 1
)

// TracerouteRequest asks the node for the route to a host (IPv4, ICMP).
type TracerouteRequest struct {
	Host    string `json:"host"`
	MaxHops int    `json:"maxHops"`
}

// TracerouteHop is one TTL; IP is empty when no router answered.
type TracerouteHop struct {
	TTL   int     `json:"ttl"`
	IP    string  `json:"ip,omitempty"`
	RttMs float64 `json:"rttMs,omitempty"`
}

type TracerouteResponse struct {
	Host    string          `json:"host"`
	IP      string          `json:"ip"`
	Reached bool            `json:"reached"`
	Hops    []TracerouteHop `json:"hops"`
}

var traceSem = make(chan struct{}, maxConcurrentTraces)

func (w *WebSocketReporter) handleTraceroute(data interface{}) (TracerouteResponse, error) {
	raw, err := json.Marshal(data)
	if err != nil {
		return TracerouteResponse{}, fmt.Errorf("序列化路由追踪数据失败: %v", err)
	}
	var req TracerouteRequest
	if err := json.Unmarshal(raw, &req); err != nil {
		return TracerouteResponse{}, fmt.Errorf("解析路由追踪请求失败: %v", err)
	}
	host := strings.TrimSpace(req.Host)
	if net.ParseIP(host) == nil && !isValidHostname(host) {
		return TracerouteResponse{}, fmt.Errorf("无效的IP地址或主机名")
	}
	select {
	case traceSem <- struct{}{}:
		defer func() { <-traceSem }()
	default:
		return TracerouteResponse{}, fmt.Errorf("路由追踪任务过多，请稍后重试")
	}
	maxHops := req.MaxHops
	if maxHops <= 0 || maxHops > tracerouteMaxHops {
		maxHops = tracerouteMaxHops
	}
	return traceroute(host, maxHops)
}

// traceroute sends ICMP echoes with TTL 1..maxHops at once (twice, for
// routers that drop one) and collects the Time Exceeded answers. It needs a
// raw socket: root or CAP_NET_RAW.
func traceroute(host string, maxHops int) (TracerouteResponse, error) {
	resp := TracerouteResponse{Host: host}
	addrs, err := net.LookupIP(host)
	if err != nil {
		return resp, fmt.Errorf("DNS解析失败: %v", err)
	}
	var dst net.IP
	for _, a := range addrs {
		if v4 := a.To4(); v4 != nil {
			dst = v4
			break
		}
	}
	if dst == nil {
		return resp, fmt.Errorf("目标没有 IPv4 地址")
	}
	resp.IP = dst.String()

	conn, err := icmp.ListenPacket("ip4:icmp", "0.0.0.0")
	if err != nil {
		return resp, fmt.Errorf("需要 root 或 NET_RAW 权限: %v", err)
	}
	defer conn.Close()
	pc := conn.IPv4PacketConn()

	id := rand.Intn(0xffff) + 1
	var mu sync.Mutex
	sent := make(map[int]time.Time, maxHops)
	hops := make(map[int]TracerouteHop, maxHops)
	reachedAt := 0

	send := func(ttl, round int) error {
		seq := round*tracerouteMaxHops + ttl
		msg := icmp.Message{
			Type: ipv4.ICMPTypeEcho,
			Body: &icmp.Echo{ID: id, Seq: seq, Data: []byte("flyx-trace")},
		}
		b, err := msg.Marshal(nil)
		if err != nil {
			return err
		}
		if err := pc.SetTTL(ttl); err != nil {
			return err
		}
		mu.Lock()
		sent[seq] = time.Now()
		mu.Unlock()
		_, err = pc.WriteTo(b, nil, &net.IPAddr{IP: dst})
		return err
	}

	done := make(chan struct{})
	go func() {
		defer close(done)
		buf := make([]byte, 1500)
		deadline := time.Now().Add(time.Duration(tracerouteRounds) * tracerouteWait)
		_ = conn.SetReadDeadline(deadline)
		for {
			n, peer, err := conn.ReadFrom(buf)
			if err != nil {
				return
			}
			seq, reached, ok := matchTraceReply(buf[:n], id, dst)
			if !ok {
				continue
			}
			ttl := (seq-1)%tracerouteMaxHops + 1
			mu.Lock()
			if at, ok := sent[seq]; ok {
				if _, seen := hops[ttl]; !seen {
					hops[ttl] = TracerouteHop{
						TTL:   ttl,
						IP:    peerIP(peer),
						RttMs: float64(time.Since(at).Microseconds()) / 1000,
					}
				}
			}
			if reached && (reachedAt == 0 || ttl < reachedAt) {
				reachedAt = ttl
			}
			mu.Unlock()
		}
	}()

	for round := 0; round < tracerouteRounds; round++ {
		for ttl := 1; ttl <= maxHops; ttl++ {
			mu.Lock()
			_, seen := hops[ttl]
			stop := reachedAt != 0 && ttl > reachedAt
			mu.Unlock()
			if seen || stop {
				continue
			}
			if err := send(ttl, round); err != nil {
				return resp, fmt.Errorf("发送探测包失败: %v", err)
			}
			time.Sleep(2 * time.Millisecond)
		}
		// Wait for answers; stop early once every hop up to the target did.
		for end := time.Now().Add(tracerouteWait); time.Now().Before(end); {
			mu.Lock()
			complete := reachedAt != 0
			for ttl := 1; complete && ttl <= reachedAt; ttl++ {
				_, complete = hops[ttl]
			}
			mu.Unlock()
			if complete {
				break
			}
			time.Sleep(50 * time.Millisecond)
		}
	}
	_ = conn.SetReadDeadline(time.Now())
	<-done

	mu.Lock()
	defer mu.Unlock()
	last := maxHops
	if reachedAt != 0 {
		last = reachedAt
		resp.Reached = true
	} else {
		// Trim the silent tail after the last router that answered.
		for last > 0 {
			if _, ok := hops[last]; ok {
				break
			}
			last--
		}
	}
	resp.Hops = make([]TracerouteHop, 0, last)
	for ttl := 1; ttl <= last; ttl++ {
		if h, ok := hops[ttl]; ok {
			resp.Hops = append(resp.Hops, h)
		} else {
			resp.Hops = append(resp.Hops, TracerouteHop{TTL: ttl})
		}
	}
	return resp, nil
}

// matchTraceReply returns the probe sequence an ICMP message answers: an
// echo reply from the target, or a Time Exceeded / Unreachable quoting our
// echo to it.
func matchTraceReply(b []byte, id int, dst net.IP) (seq int, reached bool, ok bool) {
	m, err := icmp.ParseMessage(tracerouteICMPProtoV4, b)
	if err != nil {
		return 0, false, false
	}
	switch body := m.Body.(type) {
	case *icmp.Echo:
		if m.Type == ipv4.ICMPTypeEchoReply && body.ID == id {
			return body.Seq, true, true
		}
	case *icmp.TimeExceeded:
		return quotedEcho(body.Data, id, dst)
	case *icmp.DstUnreach:
		seq, _, ok := quotedEcho(body.Data, id, dst)
		return seq, true, ok
	}
	return 0, false, false
}

// quotedEcho reads the original IPv4 header and echo header an ICMP error
// carries.
func quotedEcho(data []byte, id int, dst net.IP) (int, bool, bool) {
	if len(data) < 20 {
		return 0, false, false
	}
	ihl := int(data[0]&0x0f) * 4
	if ihl < 20 || len(data) < ihl+8 || !net.IP(data[16:20]).Equal(dst) {
		return 0, false, false
	}
	echo := data[ihl:]
	if echo[0] != byte(ipv4.ICMPTypeEcho) || int(binary.BigEndian.Uint16(echo[4:6])) != id {
		return 0, false, false
	}
	return int(binary.BigEndian.Uint16(echo[6:8])), false, true
}

func peerIP(a net.Addr) string {
	switch v := a.(type) {
	case *net.IPAddr:
		return v.IP.String()
	case *net.UDPAddr:
		return v.IP.String()
	}
	return a.String()
}
