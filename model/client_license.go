package model

import (
	"strings"

	"github.com/QuantumNous/new-api/common"
	"gorm.io/gorm"
)

const (
	ClientLicenseStatusActive   = "active"
	ClientLicenseStatusDisabled = "disabled"
	ClientLicenseDefaultCodeLen = 8
	ClientLicenseMinCodeLen     = 4
	ClientLicenseMaxCodeLen     = 32
)

type ClientLicense struct {
	Id                                  int            `json:"id"`
	Code                                string         `json:"code" gorm:"type:varchar(64);uniqueIndex"`
	Name                                string         `json:"name" gorm:"type:varchar(64);index"`
	Status                              string         `json:"status" gorm:"type:varchar(16);default:'active';index"`
	UserId                              int            `json:"user_id" gorm:"index"`
	TokenId                             int            `json:"token_id" gorm:"index"`
	SubscriptionPlanId                  int            `json:"subscription_plan_id" gorm:"index;default:0"`
	UserSubscriptionId                  int            `json:"user_subscription_id" gorm:"index;default:0"`
	DeviceHash                          string         `json:"device_hash" gorm:"type:varchar(128);default:'';index"`
	UnlimitedQuota                      bool           `json:"unlimited_quota" gorm:"default:true"`
	Quota                               int            `json:"quota" gorm:"default:0"`
	CreatedTime                         int64          `json:"created_time" gorm:"bigint"`
	ActivatedTime                       int64          `json:"activated_time" gorm:"bigint;default:0"`
	LastRedeemTime                      int64          `json:"last_redeem_time" gorm:"bigint"`
	DurationDays                        int            `json:"duration_days" gorm:"default:0"`
	ExpiredTime                         int64          `json:"expired_time" gorm:"bigint;default:0"`
	RemainingQuota                      int            `json:"remaining_quota" gorm:"-"`
	UsedQuota                           int            `json:"used_quota" gorm:"-"`
	SubscriptionPlanTitle               string         `json:"subscription_plan_title" gorm:"-"`
	SubscriptionPriceAmount             float64        `json:"subscription_price_amount" gorm:"-"`
	SubscriptionDurationUnit            string         `json:"subscription_duration_unit" gorm:"-"`
	SubscriptionDurationValue           int            `json:"subscription_duration_value" gorm:"-"`
	SubscriptionCustomSeconds           int64          `json:"subscription_custom_seconds" gorm:"-"`
	UserSubscriptionStatus              string         `json:"user_subscription_status" gorm:"-"`
	SubscriptionNextResetTime           int64          `json:"subscription_next_reset_time" gorm:"-"`
	SubscriptionAmountTotal             int64          `json:"subscription_amount_total" gorm:"-"`
	SubscriptionAmountUsed              int64          `json:"subscription_amount_used" gorm:"-"`
	SubscriptionQuotaResetPeriod        string         `json:"subscription_quota_reset_period" gorm:"-"`
	SubscriptionQuotaResetCustomSeconds int64          `json:"subscription_quota_reset_custom_seconds" gorm:"-"`
	DeletedAt                           gorm.DeletedAt `gorm:"index"`
}

func NormalizeClientLicenseCode(code string) string {
	return strings.ToUpper(strings.TrimSpace(code))
}

func (license *ClientLicense) Normalize() {
	license.Code = NormalizeClientLicenseCode(license.Code)
	license.Name = strings.TrimSpace(license.Name)
	license.Status = strings.TrimSpace(strings.ToLower(license.Status))
	if license.Status == "" {
		license.Status = ClientLicenseStatusActive
	}
	if license.DurationDays < 0 {
		license.DurationDays = 0
	}
	license.DeviceHash = strings.TrimSpace(license.DeviceHash)
}

func NormalizeClientLicenseCodeLength(length int) int {
	if length <= 0 {
		return ClientLicenseDefaultCodeLen
	}
	if length < ClientLicenseMinCodeLen {
		return ClientLicenseMinCodeLen
	}
	if length > ClientLicenseMaxCodeLen {
		return ClientLicenseMaxCodeLen
	}
	return length
}

func GenerateClientLicenseCode(length int) (string, error) {
	length = NormalizeClientLicenseCodeLength(length)
	raw, err := common.GenerateRandomCharsKey(length)
	if err != nil {
		return "", err
	}
	raw = strings.ToUpper(raw)
	parts := make([]string, 0, (length+3)/4)
	for len(raw) > 4 {
		parts = append(parts, raw[:4])
		raw = raw[4:]
	}
	if raw != "" {
		parts = append(parts, raw)
	}
	return "CDX-" + strings.Join(parts, "-"), nil
}

func (license *ClientLicense) EffectiveExpiredTime() int64 {
	if license.ExpiredTime > 0 {
		return license.ExpiredTime
	}
	if license.DurationDays > 0 && license.ActivatedTime > 0 {
		return license.ActivatedTime + int64(license.DurationDays)*86400
	}
	return 0
}

func (license *ClientLicense) IsExpired(now int64) bool {
	expiredTime := license.EffectiveExpiredTime()
	return expiredTime > 0 && expiredTime < now
}

func (license *ClientLicense) ClientStatus(now int64) string {
	if license.Status != ClientLicenseStatusActive {
		return "disabled"
	}
	if license.IsExpired(now) {
		return "expired"
	}
	return "active"
}

func (license *ClientLicense) Insert() error {
	license.Normalize()
	if license.CreatedTime == 0 {
		license.CreatedTime = common.GetTimestamp()
	}
	// Use an explicit value map so false/0 values are inserted as-is instead of
	// being replaced by database defaults during create.
	values := map[string]any{
		"code":                 license.Code,
		"name":                 license.Name,
		"status":               license.Status,
		"user_id":              license.UserId,
		"token_id":             license.TokenId,
		"subscription_plan_id": license.SubscriptionPlanId,
		"user_subscription_id": license.UserSubscriptionId,
		"device_hash":          license.DeviceHash,
		"unlimited_quota":      license.UnlimitedQuota,
		"quota":                license.Quota,
		"created_time":         license.CreatedTime,
		"activated_time":       license.ActivatedTime,
		"last_redeem_time":     license.LastRedeemTime,
		"duration_days":        license.DurationDays,
		"expired_time":         license.ExpiredTime,
	}
	if err := DB.Model(&ClientLicense{}).Create(values).Error; err != nil {
		return err
	}
	created, err := GetClientLicenseByCode(license.Code)
	if err != nil {
		return err
	}
	*license = *created
	return nil
}

func (license *ClientLicense) Update() error {
	license.Normalize()
	return DB.Model(license).Select(
		"name",
		"status",
		"user_id",
		"token_id",
		"subscription_plan_id",
		"user_subscription_id",
		"device_hash",
		"unlimited_quota",
		"quota",
		"activated_time",
		"last_redeem_time",
		"duration_days",
		"expired_time",
	).Updates(license).Error
}

func GetClientLicenseByCode(code string) (*ClientLicense, error) {
	normalized := NormalizeClientLicenseCode(code)
	if normalized == "" {
		return nil, gorm.ErrRecordNotFound
	}
	license := &ClientLicense{}
	err := DB.Where("code = ?", normalized).First(license).Error
	return license, err
}

func GetClientLicenseByCodeUnscoped(code string) (*ClientLicense, error) {
	normalized := NormalizeClientLicenseCode(code)
	if normalized == "" {
		return nil, gorm.ErrRecordNotFound
	}
	license := &ClientLicense{}
	err := DB.Unscoped().Where("code = ?", normalized).First(license).Error
	return license, err
}
