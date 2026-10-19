package handler

import (
	"fmt"
	"strconv"
	"strings"
)

type forwardRuntimeLimiters struct {
	TrafficLimiter string
	ConnLimiter    string
}

type forwardLimiterConfig struct {
	Name   string
	Limits []string
}

func (h *Handler) ensureLimiterOnNode(nodeID int64, limiterID int64, speed int) error {
	if err := h.upsertLimiterOnNode(nodeID, limiterID, speed); err != nil {
		return fmt.Errorf("限速规则下发失败: %w", err)
	}

	return nil
}

func (h *Handler) ensureConnLimiterOnNode(nodeID int64, cfg forwardLimiterConfig) error {
	if cfg.Name == "" || len(cfg.Limits) == 0 {
		return nil
	}
	payload := map[string]interface{}{"name": cfg.Name, "limits": cfg.Limits}
	if _, err := h.sendNodeCommand(nodeID, "AddCLimiters", payload, false, false); err != nil {
		if !isAlreadyExistsMessage(err.Error()) {
			return fmt.Errorf("连接限制器下发失败: %w", err)
		}
		updatePayload := map[string]interface{}{"limiter": cfg.Name, "data": payload}
		if _, updateErr := h.sendNodeCommand(nodeID, "UpdateCLimiters", updatePayload, false, false); updateErr != nil {
			return fmt.Errorf("连接限制器更新失败: %w", updateErr)
		}
	}
	return nil
}

func buildConnLimiterConfigs(forward *forwardRecord, userMaxConn int) []forwardLimiterConfig {
	if forward == nil {
		return nil
	}
	if forward.MaxConn > 0 {
		limits := []string{fmt.Sprintf("$ %d", forward.MaxConn)}
		if forward.IPMaxConn > 0 {
			limits = append(limits, fmt.Sprintf("$$ %d", forward.IPMaxConn))
		}
		return []forwardLimiterConfig{{Name: fmt.Sprintf("rule_conn_limit_%d", forward.ID), Limits: limits}}
	}
	configs := make([]forwardLimiterConfig, 0, 2)
	if userMaxConn > 0 {
		configs = append(configs, forwardLimiterConfig{Name: fmt.Sprintf("user_conn_limit_%d", forward.UserID), Limits: []string{fmt.Sprintf("$ %d", userMaxConn)}})
	}
	if forward.IPMaxConn > 0 {
		configs = append(configs, forwardLimiterConfig{Name: fmt.Sprintf("rule_conn_limit_%d", forward.ID), Limits: []string{fmt.Sprintf("$$ %d", forward.IPMaxConn)}})
	}
	return configs
}

func joinLimiterNames(configs []forwardLimiterConfig) string {
	names := make([]string, 0, len(configs))
	for _, cfg := range configs {
		if cfg.Name != "" {
			names = append(names, cfg.Name)
		}
	}
	return strings.Join(names, ",")
}

func speedToLimitLine(key string, speed int) string {
	rate := float64(speed) / 8.0
	return fmt.Sprintf("%s %.1fMB %.1fMB", key, rate, rate)
}

func buildTrafficLimiterPayload(name string, totalSpeed *int, ipSpeed *int) map[string]interface{} {
	limits := make([]string, 0, 3)
	if totalSpeed != nil && *totalSpeed > 0 {
		limits = append(limits, speedToLimitLine("$", *totalSpeed))
	}
	if ipSpeed != nil && *ipSpeed > 0 {
		limits = append(limits, speedToLimitLine("0.0.0.0/0", *ipSpeed), speedToLimitLine("::/0", *ipSpeed))
	}
	return map[string]interface{}{"name": name, "limits": limits}
}

func buildLimiterAddPayload(limiterID int64, speed int) (string, map[string]interface{}) {
	name := strconv.FormatInt(limiterID, 10)

	return name, map[string]interface{}{
		"name":   name,
		"limits": []string{speedToLimitLine("$", speed)},
	}
}

func buildLimiterUpdatePayload(name string, data map[string]interface{}) map[string]interface{} {
	return map[string]interface{}{
		"limiter": name,
		"data":    data,
	}
}

func (h *Handler) upsertLimiterOnNode(nodeID int64, limiterID int64, speed int) error {
	name, addPayload := buildLimiterAddPayload(limiterID, speed)
	if _, err := h.sendNodeCommand(nodeID, "AddLimiters", addPayload, false, false); err != nil {
		if !isAlreadyExistsMessage(err.Error()) {
			return err
		}
		payload := map[string]interface{}{
			"name":   name,
			"limits": addPayload["limits"],
		}
		if _, updateErr := h.sendNodeCommand(nodeID, "UpdateLimiters", buildLimiterUpdatePayload(name, payload), false, false); updateErr != nil {
			return updateErr
		}
	}

	return nil
}

func (h *Handler) ensureTrafficLimiterOnNode(nodeID int64, name string, totalSpeed *int, ipSpeed *int) error {
	payload := buildTrafficLimiterPayload(name, totalSpeed, ipSpeed)
	limits, _ := payload["limits"].([]string)
	if name == "" || len(limits) == 0 {
		return nil
	}
	if _, err := h.sendNodeCommand(nodeID, "AddLimiters", payload, false, false); err != nil {
		if !isAlreadyExistsMessage(err.Error()) {
			return fmt.Errorf("限速规则下发失败: %w", err)
		}
		if _, updateErr := h.sendNodeCommand(nodeID, "UpdateLimiters", buildLimiterUpdatePayload(name, payload), false, false); updateErr != nil {
			return fmt.Errorf("限速规则更新失败: %w", updateErr)
		}
	}
	return nil
}
