package controller

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type clientCompatRedeemRequest struct {
	Code       string `json:"code"`
	DeviceHash string `json:"device_hash"`
}

type clientCompatConfig struct {
	Enabled           bool   `json:"enabled"`
	Notice            string `json:"notice"`
	MinVersion        string `json:"min_version"`
	LatestVersion     string `json:"latest_version"`
	UpdateURL         string `json:"update_url"`
	DefaultModel      string `json:"default_model"`
	DefaultOCModel    string `json:"default_oc_model"`
	DefaultSmallModel string `json:"default_small_model"`
}

func GetClientCompatConfig(c *gin.Context) {
	cfg := loadClientCompatConfig()
	c.JSON(http.StatusOK, gin.H{
		"enabled":             cfg.Enabled,
		"notice":              cfg.Notice,
		"min_version":         cfg.MinVersion,
		"latest_version":      cfg.LatestVersion,
		"update_url":          cfg.UpdateURL,
		"default_model":       cfg.DefaultModel,
		"default_oc_model":    cfg.DefaultOCModel,
		"default_small_model": cfg.DefaultSmallModel,
	})
}

func RedeemClientCompatCard(c *gin.Context) {
	cfg := loadClientCompatConfig()
	if !cfg.Enabled {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": firstNonEmpty(cfg.Notice, "service disabled"),
		})
		return
	}

	req := clientCompatRedeemRequest{}
	if err := json.NewDecoder(c.Request.Body).Decode(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": "invalid request payload",
		})
		return
	}

	code := model.NormalizeClientLicenseCode(req.Code)
	deviceHash := strings.TrimSpace(req.DeviceHash)
	if code == "" {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "code is required",
		})
		return
	}

	if err := ensureSeedClientLicense(); err != nil {
		common.SysError("failed to ensure seeded client license: " + err.Error())
	}

	license, err := model.GetClientLicenseByCode(code)
	if err != nil {
		if !errors.Is(err, gorm.ErrRecordNotFound) {
			common.SysError("failed to load client license by code: " + err.Error())
			c.JSON(http.StatusOK, gin.H{
				"success": false,
				"message": "failed to load card",
			})
			return
		}
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "card not found",
		})
		return
	}

	now := common.GetTimestamp()
	if license.ClientStatus(now) == "disabled" {
		disableClientLicenseTokenIfNeeded(license)
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "card is disabled",
		})
		return
	}
	if license.ClientStatus(now) == "expired" {
		expireClientLicenseTokenIfNeeded(license)
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "card is expired",
		})
		return
	}

	if license.DeviceHash != "" && deviceHash != "" && license.DeviceHash != deviceHash {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "card is already bound to another device",
		})
		return
	}

	token, err := getOrCreateClientCompatToken(license, deviceHash)
	if err != nil {
		common.SysError("failed to redeem client card: " + err.Error())
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "failed to issue token",
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success":    true,
		"key":        token.Key,
		"expires_at": clientCompatExpiresAt(license, token),
	})
}

func QueryClientCompatUsage(c *gin.Context) {
	cfg := loadClientCompatConfig()
	if !cfg.Enabled {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": firstNonEmpty(cfg.Notice, "service disabled"),
		})
		return
	}

	req := clientCompatRedeemRequest{}
	if err := json.NewDecoder(c.Request.Body).Decode(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": "invalid request payload",
		})
		return
	}

	code := model.NormalizeClientLicenseCode(req.Code)
	deviceHash := strings.TrimSpace(req.DeviceHash)
	if code == "" {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "code is required",
		})
		return
	}

	if err := ensureSeedClientLicense(); err != nil {
		common.SysError("failed to ensure seeded client license: " + err.Error())
	}

	license, err := model.GetClientLicenseByCode(code)
	if err != nil {
		if !errors.Is(err, gorm.ErrRecordNotFound) {
			common.SysError("failed to load client license by code: " + err.Error())
			c.JSON(http.StatusOK, gin.H{
				"success": false,
				"message": "failed to load card",
			})
			return
		}
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "card not found",
		})
		return
	}

	if license.DeviceHash != "" && deviceHash != "" && license.DeviceHash != deviceHash {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "device mismatch",
		})
		return
	}

	now := common.GetTimestamp()
	status := license.ClientStatus(now)
	var token *model.Token
	if license.TokenId > 0 {
		token, err = model.GetTokenById(license.TokenId)
		if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
			common.SysError("failed to load client token by id: " + err.Error())
			c.JSON(http.StatusOK, gin.H{
				"success": false,
				"message": "failed to query usage",
			})
			return
		}
		if errors.Is(err, gorm.ErrRecordNotFound) {
			token = nil
		}
	}

	if token != nil {
		switch token.Status {
		case common.TokenStatusDisabled:
			status = "disabled"
		case common.TokenStatusExpired:
			status = "expired"
		case common.TokenStatusExhausted:
			status = "exhausted"
		}
	}

	usedAmount := 0.0
	remainAmount := quotaToClientAmount(license.Quota)
	unlimited := license.UnlimitedQuota
	if token != nil {
		usedAmount = quotaToClientAmount(token.UsedQuota)
		remainAmount = quotaToClientAmount(token.RemainQuota)
		unlimited = token.UnlimitedQuota
	}

	c.JSON(http.StatusOK, gin.H{
		"success":       true,
		"used_amount":   usedAmount,
		"remain_amount": remainAmount,
		"unlimited":     unlimited,
		"expires_at":    clientCompatExpiresAt(license, token),
		"status":        status,
	})
}

func loadClientCompatConfig() clientCompatConfig {
	return clientCompatConfig{
		Enabled:           common.GetEnvOrDefaultBool("AI_DEPLOYER_CLIENT_ENABLED", true),
		Notice:            strings.TrimSpace(common.GetEnvOrDefaultString("AI_DEPLOYER_CLIENT_NOTICE", "")),
		MinVersion:        common.GetEnvOrDefaultString("AI_DEPLOYER_CLIENT_MIN_VERSION", "1.0.0"),
		LatestVersion:     common.GetEnvOrDefaultString("AI_DEPLOYER_CLIENT_LATEST_VERSION", "1.0.4"),
		UpdateURL:         strings.TrimSpace(common.GetEnvOrDefaultString("AI_DEPLOYER_CLIENT_UPDATE_URL", "")),
		DefaultModel:      common.GetEnvOrDefaultString("AI_DEPLOYER_CLIENT_DEFAULT_MODEL", "gpt-5.3-codex"),
		DefaultOCModel:    common.GetEnvOrDefaultString("AI_DEPLOYER_CLIENT_DEFAULT_OC_MODEL", "openai/gpt-5.3-codex"),
		DefaultSmallModel: common.GetEnvOrDefaultString("AI_DEPLOYER_CLIENT_DEFAULT_SMALL_MODEL", "openai/gpt-4.1-mini"),
	}
}

func ensureSeedClientLicense() error {
	code := model.NormalizeClientLicenseCode(common.GetEnvOrDefaultString("AI_DEPLOYER_CLIENT_SEED_CODE", "CDX-DEMO-0001"))
	if code == "" {
		return nil
	}
	if _, err := model.GetClientLicenseByCode(code); err == nil {
		return nil
	} else if !errors.Is(err, gorm.ErrRecordNotFound) {
		return err
	}

	expiredTime := int64(0)
	expiresAt := strings.TrimSpace(common.GetEnvOrDefaultString("AI_DEPLOYER_CLIENT_SEED_EXPIRES_AT", ""))
	if expiresAt != "" {
		parsed, err := time.Parse(time.RFC3339, expiresAt)
		if err != nil {
			return err
		}
		expiredTime = parsed.Unix()
	}

	license := &model.ClientLicense{
		Code:           code,
		Name:           strings.TrimSpace(common.GetEnvOrDefaultString("AI_DEPLOYER_CLIENT_SEED_NAME", "starter")),
		Status:         model.ClientLicenseStatusActive,
		UnlimitedQuota: common.GetEnvOrDefaultBool("AI_DEPLOYER_CLIENT_SEED_UNLIMITED", true),
		Quota:          common.GetEnvOrDefault("AI_DEPLOYER_CLIENT_SEED_QUOTA", 0),
		DurationDays:   common.GetEnvOrDefault("AI_DEPLOYER_CLIENT_SEED_DURATION_DAYS", 0),
		ExpiredTime:    expiredTime,
	}

	if existing, err := model.GetClientLicenseByCodeUnscoped(code); err == nil {
		updates := map[string]any{
			"name":            license.Name,
			"status":          model.ClientLicenseStatusActive,
			"unlimited_quota": license.UnlimitedQuota,
			"quota":           license.Quota,
			"duration_days":   license.DurationDays,
			"expired_time":    license.ExpiredTime,
			"deleted_at":      nil,
		}
		return model.DB.Unscoped().Model(existing).Updates(updates).Error
	} else if !errors.Is(err, gorm.ErrRecordNotFound) {
		return err
	}

	return license.Insert()
}

func getOrCreateClientCompatToken(license *model.ClientLicense, deviceHash string) (*model.Token, error) {
	now := common.GetTimestamp()
	if license.ActivatedTime == 0 && license.DurationDays > 0 {
		license.ActivatedTime = now
	}
	if license.TokenId > 0 {
		token, err := model.GetTokenById(license.TokenId)
		if err == nil {
			license.DeviceHash = firstNonEmpty(license.DeviceHash, deviceHash)
			license.LastRedeemTime = now
			if updateErr := license.Update(); updateErr != nil {
				return nil, updateErr
			}
			return syncClientLicenseToken(license, token)
		}
		if !errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, err
		}
	}

	user, err := ensureClientCompatUser()
	if err != nil {
		return nil, err
	}

	key, err := common.GenerateKey()
	if err != nil {
		return nil, err
	}

	expiredAt := int64(-1)
	if license.ExpiredTime > 0 {
		expiredAt = license.ExpiredTime
	}

	token := &model.Token{
		UserId:             user.Id,
		Name:               buildClientCompatTokenName(license),
		Key:                key,
		Status:             common.TokenStatusEnabled,
		CreatedTime:        now,
		AccessedTime:       now,
		ExpiredTime:        expiredAt,
		RemainQuota:        license.Quota,
		UnlimitedQuota:     license.UnlimitedQuota,
		ModelLimitsEnabled: false,
		Group:              strings.TrimSpace(common.GetEnvOrDefaultString("AI_DEPLOYER_CLIENT_SERVICE_GROUP", "default")),
	}
	if err := token.Insert(); err != nil {
		return nil, err
	}

	license.UserId = user.Id
	license.TokenId = token.Id
	license.DeviceHash = firstNonEmpty(license.DeviceHash, deviceHash)
	license.LastRedeemTime = now
	if err := license.Update(); err != nil {
		return nil, err
	}

	return syncClientLicenseToken(license, token)
}

func ensureClientCompatUser() (*model.User, error) {
	username := strings.TrimSpace(common.GetEnvOrDefaultString("AI_DEPLOYER_CLIENT_SERVICE_USERNAME", "ai_deployer_bot"))
	group := strings.TrimSpace(common.GetEnvOrDefaultString("AI_DEPLOYER_CLIENT_SERVICE_GROUP", "default"))
	quota := common.GetEnvOrDefault("AI_DEPLOYER_CLIENT_SERVICE_USER_QUOTA", 1000000000)
	user := &model.User{}
	if err := model.DB.Where("username = ?", username).First(user).Error; err == nil {
		updated := false
		if user.Status != common.UserStatusEnabled {
			user.Status = common.UserStatusEnabled
			updated = true
		}
		if strings.TrimSpace(user.Group) != group {
			user.Group = group
			updated = true
		}
		if user.Quota < quota {
			user.Quota = quota
			updated = true
		}
		if updated {
			user.DisplayName = "AI Deployer Client"
			user.Remark = "system account for AI Deployer client compatibility"
			if err := user.Update(false); err != nil {
				return nil, err
			}
		}
		return user, nil
	} else if !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, err
	}

	password := common.GetUUID()
	created := &model.User{
		Username:    username,
		Password:    password,
		DisplayName: "AI Deployer Client",
		Role:        common.RoleCommonUser,
		Status:      common.UserStatusEnabled,
		Group:       group,
		Remark:      "system account for AI Deployer client compatibility",
	}
	if err := created.Insert(0); err != nil {
		return nil, err
	}
	if err := model.DB.Where("username = ?", username).First(created).Error; err != nil {
		return nil, err
	}

	created.Status = common.UserStatusEnabled
	created.Group = group
	created.DisplayName = "AI Deployer Client"
	created.Remark = "system account for AI Deployer client compatibility"
	created.Quota = quota
	if err := created.Update(false); err != nil {
		return nil, err
	}
	return created, nil
}

func disableClientLicenseTokenIfNeeded(license *model.ClientLicense) {
	if license.TokenId <= 0 {
		return
	}
	token, err := model.GetTokenById(license.TokenId)
	if err != nil || token == nil {
		return
	}
	if token.Status == common.TokenStatusDisabled {
		return
	}
	token.Status = common.TokenStatusDisabled
	_ = token.SelectUpdate()
}

func expireClientLicenseTokenIfNeeded(license *model.ClientLicense) {
	if license.TokenId <= 0 {
		return
	}
	token, err := model.GetTokenById(license.TokenId)
	if err != nil || token == nil {
		return
	}
	if token.Status == common.TokenStatusExpired {
		return
	}
	token.Status = common.TokenStatusExpired
	_ = token.SelectUpdate()
}

func syncClientLicenseToken(license *model.ClientLicense, token *model.Token) (*model.Token, error) {
	if license == nil {
		return token, nil
	}
	if token == nil {
		if license.TokenId <= 0 {
			return nil, nil
		}
		var err error
		token, err = model.GetTokenById(license.TokenId)
		if err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return nil, nil
			}
			return nil, err
		}
	}

	now := common.GetTimestamp()
	token.Name = buildClientCompatTokenName(license)
	token.UnlimitedQuota = license.UnlimitedQuota
	effectiveExpiredTime := license.EffectiveExpiredTime()
	if effectiveExpiredTime > 0 {
		token.ExpiredTime = effectiveExpiredTime
	} else {
		token.ExpiredTime = -1
	}

	if license.UnlimitedQuota {
		token.RemainQuota = license.Quota
	} else {
		remain := license.Quota - token.UsedQuota
		if remain < 0 {
			remain = 0
		}
		token.RemainQuota = remain
	}

	switch {
	case license.Status != model.ClientLicenseStatusActive:
		token.Status = common.TokenStatusDisabled
	case license.IsExpired(now):
		token.Status = common.TokenStatusExpired
	case !token.UnlimitedQuota && token.RemainQuota <= 0:
		token.Status = common.TokenStatusExhausted
	default:
		token.Status = common.TokenStatusEnabled
	}

	if err := token.Update(); err != nil {
		return nil, err
	}
	return token, nil
}

func clientCompatExpiresAt(license *model.ClientLicense, token *model.Token) string {
	expiredTime := int64(0)
	if license != nil {
		expiredTime = license.EffectiveExpiredTime()
	}
	if expiredTime == 0 && token != nil && token.ExpiredTime > 0 {
		expiredTime = token.ExpiredTime
	}
	if expiredTime <= 0 {
		return ""
	}
	return time.Unix(expiredTime, 0).UTC().Format(time.RFC3339)
}

func quotaToClientAmount(quota int) float64 {
	return float64(quota) / common.QuotaPerUnit
}

func buildClientCompatTokenName(license *model.ClientLicense) string {
	base := "AI Deployer"
	if license == nil || license.Code == "" {
		return base
	}
	name := base + " " + license.Code
	if len(name) > 50 {
		return name[:50]
	}
	return name
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		value = strings.TrimSpace(value)
		if value != "" {
			return value
		}
	}
	return ""
}
