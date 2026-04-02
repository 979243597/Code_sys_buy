package model

import (
	"strings"

	"github.com/QuantumNous/new-api/common"
	"gorm.io/gorm"
)

const (
	ClientLicenseStatusActive   = "active"
	ClientLicenseStatusDisabled = "disabled"
)

type ClientLicense struct {
	Id             int            `json:"id"`
	Code           string         `json:"code" gorm:"type:varchar(64);uniqueIndex"`
	Name           string         `json:"name" gorm:"type:varchar(64);index"`
	Status         string         `json:"status" gorm:"type:varchar(16);default:'active';index"`
	UserId         int            `json:"user_id" gorm:"index"`
	TokenId        int            `json:"token_id" gorm:"index"`
	DeviceHash     string         `json:"device_hash" gorm:"type:varchar(128);default:'';index"`
	UnlimitedQuota bool           `json:"unlimited_quota" gorm:"default:true"`
	Quota          int            `json:"quota" gorm:"default:0"`
	CreatedTime    int64          `json:"created_time" gorm:"bigint"`
	LastRedeemTime int64          `json:"last_redeem_time" gorm:"bigint"`
	ExpiredTime    int64          `json:"expired_time" gorm:"bigint;default:0"`
	DeletedAt      gorm.DeletedAt `gorm:"index"`
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
	license.DeviceHash = strings.TrimSpace(license.DeviceHash)
}

func (license *ClientLicense) IsExpired(now int64) bool {
	return license.ExpiredTime > 0 && license.ExpiredTime < now
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
	return DB.Create(license).Error
}

func (license *ClientLicense) Update() error {
	license.Normalize()
	return DB.Model(license).Select(
		"name",
		"status",
		"user_id",
		"token_id",
		"device_hash",
		"unlimited_quota",
		"quota",
		"last_redeem_time",
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
