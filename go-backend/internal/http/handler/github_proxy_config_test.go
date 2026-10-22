package handler

import (
	"io"
	"net/http"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"go-backend/internal/store/repo"
)

func TestGithubProxyDefaultsWithoutRepository(t *testing.T) {
	for _, h := range []*Handler{nil, {}} {
		enabled, proxyURL := h.getGithubProxyConfig()
		if enabled || proxyURL != defaultGithubProxyURL {
			t.Fatalf("getGithubProxyConfig() = (%v, %q), want (false, %q)", enabled, proxyURL, defaultGithubProxyURL)
		}
	}
}

func TestGithubProxyDefaultsAndSavedSettings(t *testing.T) {
	originalGet := systemUpgradeHTTPGet
	t.Cleanup(func() { systemUpgradeHTTPGet = originalGet })
	for _, tc := range []struct {
		name    string
		saved   map[string]string
		enabled bool
		url     string
	}{
		{name: "unconfigured", url: defaultGithubProxyURL},
		{name: "saved URL alone does not enable proxy", saved: map[string]string{"github_proxy_url": " proxy.example.com/ "}, url: "https://proxy.example.com"},
		{name: "saved enabled uses default URL", saved: map[string]string{"github_proxy_enabled": "true"}, enabled: true, url: defaultGithubProxyURL},
		{name: "saved enabled and custom URL", saved: map[string]string{"github_proxy_enabled": "true", "github_proxy_url": "https://proxy.example.com/"}, enabled: true, url: "https://proxy.example.com"},
		{name: "saved disabled keeps custom URL", saved: map[string]string{"github_proxy_enabled": "false", "github_proxy_url": "https://proxy.example.com/"}, url: "https://proxy.example.com"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			store, err := repo.Open(filepath.Join(t.TempDir(), "test.db"))
			if err != nil {
				t.Fatal(err)
			}
			defer store.Close()
			for key, value := range tc.saved {
				if err := store.UpsertConfig(key, value, 1234); err != nil {
					t.Fatal(err)
				}
			}
			h := &Handler{repo: store}
			enabled, proxyURL := h.getGithubProxyConfig()
			if enabled != tc.enabled || proxyURL != tc.url {
				t.Fatalf("getGithubProxyConfig() = (%v, %q), want (%v, %q)", enabled, proxyURL, tc.enabled, tc.url)
			}
			prefix := ""
			if tc.enabled {
				prefix = tc.url + "/"
			}
			wantDownload := prefix + githubHTMLBase + "/" + githubRepo + "/releases/download/3.3.26.2/install.sh"
			if got := h.buildGithubDownloadURL("3.3.26.2", "install.sh"); got != wantDownload {
				t.Fatalf("node download URL = %q, want %q", got, wantDownload)
			}
			wantPanel := prefix + strings.TrimRight(systemUpgradeReleaseBaseURL, "/") + "/" + githubRepo + "/releases/download/3.3.26.2/docker-compose-v4.yml"
			if got := h.buildSystemUpgradeDownloadURL("3.3.26.2", "docker-compose-v4.yml"); got != wantPanel {
				t.Fatalf("panel download URL = %q, want %q", got, wantPanel)
			}
			var gotAPI string
			systemUpgradeHTTPGet = func(_ *http.Client, url string) (*http.Response, error) {
				gotAPI = url
				return &http.Response{StatusCode: http.StatusOK, Body: io.NopCloser(strings.NewReader("[]"))}, nil
			}
			if _, err := h.fetchSystemUpgradeReleases(50); err != nil {
				t.Fatal(err)
			}
			wantAPI := prefix + strings.TrimRight(systemUpgradeAPIBaseURL, "/") + "/repos/" + githubRepo + "/releases?per_page=50"
			if gotAPI != wantAPI {
				t.Fatalf("release API URL = %q, want %q", gotAPI, wantAPI)
			}
			// Reading defaults and constructing requests must not create settings
			// or normalize a user's saved values back into the database.
			stored := map[string]string{}
			for _, key := range []string{"github_proxy_enabled", "github_proxy_url"} {
				cfg, err := store.GetConfigByName(key)
				if err != nil {
					t.Fatal(err)
				}
				if cfg != nil {
					stored[key] = cfg.Value
				}
			}
			wantStored := tc.saved
			if wantStored == nil {
				wantStored = map[string]string{}
			}
			if !reflect.DeepEqual(stored, wantStored) {
				t.Fatalf("saved settings changed: got %v, want %v", stored, wantStored)
			}
		})
	}
}
