package socket

import (
	"encoding/binary"
	"net"
	"strings"
	"testing"

	"golang.org/x/net/icmp"
	"golang.org/x/net/ipv4"
)

// timeExceeded builds the ICMP error a router sends for our echo to dst.
func timeExceeded(t *testing.T, id, seq int, dst net.IP) []byte {
	t.Helper()
	quoted := make([]byte, 28)
	quoted[0] = 0x45 // IPv4, 20-byte header
	copy(quoted[16:20], dst.To4())
	quoted[20] = byte(ipv4.ICMPTypeEcho)
	binary.BigEndian.PutUint16(quoted[24:26], uint16(id))
	binary.BigEndian.PutUint16(quoted[26:28], uint16(seq))
	b, err := (&icmp.Message{Type: ipv4.ICMPTypeTimeExceeded, Body: &icmp.TimeExceeded{Data: quoted}}).Marshal(nil)
	if err != nil {
		t.Fatal(err)
	}
	return b
}

func TestMatchTraceReply(t *testing.T) {
	dst := net.ParseIP("203.0.113.9")
	if seq, reached, ok := matchTraceReply(timeExceeded(t, 42, 7, dst), 42, dst); !ok || reached || seq != 7 {
		t.Fatalf("time exceeded: seq=%d reached=%v ok=%v", seq, reached, ok)
	}
	if _, _, ok := matchTraceReply(timeExceeded(t, 43, 7, dst), 42, dst); ok {
		t.Fatal("another trace's probe must not match")
	}
	if _, _, ok := matchTraceReply(timeExceeded(t, 42, 7, net.ParseIP("203.0.113.10")), 42, dst); ok {
		t.Fatal("a probe to another target must not match")
	}
	reply, _ := (&icmp.Message{Type: ipv4.ICMPTypeEchoReply, Body: &icmp.Echo{ID: 42, Seq: 3}}).Marshal(nil)
	if seq, reached, ok := matchTraceReply(reply, 42, dst); !ok || !reached || seq != 3 {
		t.Fatalf("echo reply: seq=%d reached=%v ok=%v", seq, reached, ok)
	}
}

func TestTracerouteLoopback(t *testing.T) {
	resp, err := traceroute("127.0.0.1", 5)
	if err != nil {
		if strings.Contains(err.Error(), "NET_RAW") {
			t.Skip("no raw socket permission")
		}
		t.Fatal(err)
	}
	if !resp.Reached || len(resp.Hops) != 1 || resp.Hops[0].IP != "127.0.0.1" {
		t.Fatalf("loopback trace = %+v", resp)
	}
}
