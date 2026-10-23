package handler

import (
	"strings"
	"testing"
)

func TestDockerInstallCommand(t *testing.T) {
	old := githubRepo
	githubRepo = "Kure29/flyx"
	defer func() { githubRepo = old }()

	cmd := dockerInstallCommand("3.4.0", "panel.example.com:6365", "s3cret")
	for _, want := range []string{
		"docker rm -f flux_agent",
		"--restart unless-stopped",
		"--network host",
		"--cap-add NET_ADMIN",
		"-v /etc/flux_agent:/etc/flux_agent",
		"-e FLUX_AGENT_ADDR=panel.example.com:6365",
		"-e FLUX_AGENT_SECRET=s3cret",
		" ghcr.io/kure29/flux-agent:3.4.0",
	} {
		if !strings.Contains(cmd, want) {
			t.Errorf("missing %q in %s", want, cmd)
		}
	}
}
