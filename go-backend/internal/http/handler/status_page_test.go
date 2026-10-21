package handler

import (
	"net/http/httptest"
	"testing"
)

// Behind a local proxy the counted address is the one the proxy saw, not
// one the client wrote into X-Forwarded-For.
func TestStatusClientIP(t *testing.T) {
	for _, c := range []struct {
		remote, xff, real, want string
	}{
		{"198.51.100.7:4000", "1.2.3.4", "", "198.51.100.7"},
		{"127.0.0.1:4000", "1.2.3.4, 198.51.100.7", "198.51.100.7", "198.51.100.7"},
		{"172.17.0.1:4000", "6.6.6.6, 198.51.100.7, 10.0.0.2", "", "198.51.100.7"},
		{"127.0.0.1:4000", "", "", "127.0.0.1"},
	} {
		r := httptest.NewRequest("GET", "/api/v1/open_api/status/x", nil)
		r.RemoteAddr = c.remote
		if c.xff != "" {
			r.Header.Set("X-Forwarded-For", c.xff)
		}
		if c.real != "" {
			r.Header.Set("X-Real-IP", c.real)
		}
		if got := statusClientIP(r); got != c.want {
			t.Fatalf("%+v: got %s", c, got)
		}
	}
}
