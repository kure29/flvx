package kernel

// Chained proxies in subscriptions (client side): landing nodes carry a
// dialer-proxy (Mihomo), detour (sing-box) or underlying-proxy (Surge) set
// to the relay group, so the client reaches a landing node through whichever
// relay node is selected there. Base64 share links cannot express a chain.

const (
	// ChainLandingGroup holds the exit nodes; it heads the node selection.
	ChainLandingGroup = "落地节点"
	// ChainRelayGroup holds the nodes landing nodes are dialed through.
	ChainRelayGroup = "中转节点"

	ChainRoleLanding = "landing"
	ChainRoleRelay   = "relay"
)

// markChain tags the endpoints the chain options match. A name matching
// both is a landing node: it must not relay for itself. Nothing is tagged
// unless both sides match a node.
func markChain(endpoints []Endpoint, opts SubOptions) {
	isLanding, isRelay := chainMatchers(opts)
	if isLanding == nil || isRelay == nil {
		return
	}
	for i := range endpoints {
		e := &endpoints[i]
		switch {
		case isLanding(*e):
			e.ChainRole = ChainRoleLanding
		case isRelay(*e):
			e.ChainRole = ChainRoleRelay
		}
	}
	if _, _, ok := chainGroups(endpoints); !ok {
		for i := range endpoints {
			endpoints[i].ChainRole = ""
		}
	}
}

// chainMatchers tell landing and relay nodes apart: by the picked names
// when there are any, else by the name expressions. Nil when unset.
func chainMatchers(opts SubOptions) (func(Endpoint) bool, func(Endpoint) bool) {
	if len(opts.ChainLandingNames) > 0 || len(opts.ChainRelayNames) > 0 {
		landing, relay := toSet(opts.ChainLandingNames), toSet(opts.ChainRelayNames)
		if len(landing) == 0 || len(relay) == 0 {
			return nil, nil
		}
		return func(e Endpoint) bool { return landing[e.Original] },
			func(e Endpoint) bool { return relay[e.Original] }
	}
	landing, _ := ParseMatcher(opts.ChainLanding)
	relay, _ := ParseMatcher(opts.ChainRelay)
	if landing == nil || relay == nil {
		return nil, nil
	}
	return func(e Endpoint) bool { return landing.match(e.Name) || landing.match(e.Original) },
		func(e Endpoint) bool { return relay.match(e.Name) || relay.match(e.Original) }
}

// chainGroups returns the landing and relay names among the endpoints a
// format could render; the chain applies only when both are non-empty.
func chainGroups(endpoints []Endpoint) (landing, relay []string, ok bool) {
	for _, e := range endpoints {
		switch e.ChainRole {
		case ChainRoleLanding:
			landing = append(landing, e.Name)
		case ChainRoleRelay:
			relay = append(relay, e.Name)
		}
	}
	return landing, relay, len(landing) > 0 && len(relay) > 0
}

func toInterfaces(names []string) []interface{} {
	out := make([]interface{}, len(names))
	for i, n := range names {
		out[i] = n
	}
	return out
}
