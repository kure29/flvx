package handler

import (
	"errors"
	"reflect"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"go-backend/internal/ws"
)

func TestNodePingSlotsLimitPerNode(t *testing.T) {
	s := newNodePingSlots()
	for i := 0; i < agentTCPPingLimit; i++ {
		if !s.acquire(1, time.Second) {
			t.Fatalf("slot %d refused", i)
		}
	}
	if s.acquire(1, 30*time.Millisecond) {
		t.Fatal("a ninth ping must wait")
	}
	if !s.acquire(2, time.Second) {
		t.Fatal("another node has its own slots")
	}
	s.release(1)
	if !s.acquire(1, time.Second) {
		t.Fatal("a released slot is free again")
	}
}

// More pings than the agent takes queue for a slot instead of failing.
func TestSendTCPPingQueuesWithinAgentLimit(t *testing.T) {
	var running, peak int32
	orig := tcpPingSend
	tcpPingSend = func(*Handler, int64, interface{}, time.Duration) (ws.CommandResult, error) {
		n := atomic.AddInt32(&running, 1)
		for {
			p := atomic.LoadInt32(&peak)
			if n <= p || atomic.CompareAndSwapInt32(&peak, p, n) {
				break
			}
		}
		time.Sleep(20 * time.Millisecond)
		atomic.AddInt32(&running, -1)
		return ws.CommandResult{}, nil
	}
	t.Cleanup(func() { tcpPingSend = orig })

	h := &Handler{pingSlots: newNodePingSlots()}
	var wg sync.WaitGroup
	var failed int32
	for i := 0; i < 2*agentTCPPingLimit+3; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if _, err := h.sendTCPPing(7, nil, 5*time.Second); err != nil {
				atomic.AddInt32(&failed, 1)
			}
		}()
	}
	wg.Wait()
	if failed != 0 || peak != agentTCPPingLimit {
		t.Fatalf("failed=%d peak=%d, want 0 and %d", failed, peak, agentTCPPingLimit)
	}
}

// An agent still busy (another panel, or pings the panel stopped waiting
// for) is asked once more.
func TestSendTCPPingRetriesBusyAgent(t *testing.T) {
	calls := 0
	orig := tcpPingSend
	tcpPingSend = func(*Handler, int64, interface{}, time.Duration) (ws.CommandResult, error) {
		calls++
		if calls == 1 {
			return ws.CommandResult{}, errors.New("TCP探测任务过多，请稍后重试")
		}
		return ws.CommandResult{Data: map[string]interface{}{"success": true}}, nil
	}
	t.Cleanup(func() { tcpPingSend = orig })

	res, err := (&Handler{}).sendTCPPing(1, nil, time.Second)
	if err != nil || calls != 2 || res.Data["success"] != true {
		t.Fatalf("err=%v calls=%d res=%+v", err, calls, res)
	}
}

func TestInterleaveByNode(t *testing.T) {
	type job struct {
		node int64
		i    int
	}
	in := []job{{1, 0}, {1, 1}, {1, 2}, {2, 0}, {2, 1}, {3, 0}}
	got := interleaveByNode(in, func(j job) int64 { return j.node })
	want := []job{{1, 0}, {2, 0}, {3, 0}, {1, 1}, {2, 1}, {1, 2}}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("got %v, want %v", got, want)
	}
}
