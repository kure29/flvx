package handler

import (
	"context"
	"log"
	"time"
)

const nodeLatencyProbeInterval = time.Minute

func (h *Handler) runNodeLatencyProbeLoop(ctx context.Context) {
	defer h.jobsWG.Done()
	ticker := time.NewTicker(nodeLatencyProbeInterval)
	defer ticker.Stop()
	h.runNodeLatencyProbeRounds(ctx, ticker.C)
}

// A slow round completes before the next one starts. Other probe jobs cannot
// delay this schedule, and cancellation prevents another round from starting.
func (h *Handler) runNodeLatencyProbeRounds(ctx context.Context, ticks <-chan time.Time) {
	for {
		if ctx.Err() != nil {
			return
		}
		if _, err := h.probeNodeLatency(ctx, nil); err != nil && ctx.Err() == nil {
			log.Printf("node latency probe failed: %v", err)
		}
		select {
		case <-ctx.Done():
			return
		case <-ticks:
		}
	}
}
