package model

import (
	"errors"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"gorm.io/gorm"
)

func applyClientLicenseViewFilter(query *gorm.DB, view string) *gorm.DB {
	now := common.GetTimestamp()
	switch strings.TrimSpace(strings.ToLower(view)) {
	case "effective", "active":
		return query.Where(
			`status = ? AND (
				(expired_time <= 0 AND (duration_days <= 0 OR activated_time <= 0)) OR
				(expired_time > 0 AND expired_time >= ?) OR
				(duration_days > 0 AND activated_time > 0 AND activated_time + duration_days * 86400 >= ?)
			)`,
			ClientLicenseStatusActive,
			now,
			now,
		)
	case "expired":
		return query.Where(
			`status = ? AND (
				(expired_time > 0 AND expired_time < ?) OR
				(duration_days > 0 AND activated_time > 0 AND activated_time + duration_days * 86400 < ?)
			)`,
			ClientLicenseStatusActive,
			now,
			now,
		)
	case "disabled":
		return query.Where("status = ?", ClientLicenseStatusDisabled)
	case "activated":
		return query.Where("(activated_time > 0 OR last_redeem_time > 0)")
	case "pending":
		return query.Where("(activated_time <= 0 AND last_redeem_time <= 0)")
	default:
		return query
	}
}

func GetAllClientLicenses(startIdx int, num int, view string) (licenses []*ClientLicense, total int64, err error) {
	tx := DB.Begin()
	if tx.Error != nil {
		return nil, 0, tx.Error
	}
	defer func() {
		if r := recover(); r != nil {
			tx.Rollback()
		}
	}()

	query := applyClientLicenseViewFilter(tx.Model(&ClientLicense{}), view)
	if err = query.Count(&total).Error; err != nil {
		tx.Rollback()
		return nil, 0, err
	}
	if err = query.Order("id desc").Limit(num).Offset(startIdx).Find(&licenses).Error; err != nil {
		tx.Rollback()
		return nil, 0, err
	}
	if err = tx.Commit().Error; err != nil {
		return nil, 0, err
	}
	return licenses, total, nil
}

func SearchClientLicenses(keyword string, startIdx int, num int, view string) (licenses []*ClientLicense, total int64, err error) {
	tx := DB.Begin()
	if tx.Error != nil {
		return nil, 0, tx.Error
	}
	defer func() {
		if r := recover(); r != nil {
			tx.Rollback()
		}
	}()

	trimmed := strings.TrimSpace(keyword)
	query := applyClientLicenseViewFilter(tx.Model(&ClientLicense{}), view)
	if trimmed != "" {
		if id, convErr := strconv.Atoi(trimmed); convErr == nil {
			query = query.Where("id = ? OR code LIKE ? OR name LIKE ?", id, trimmed+"%", trimmed+"%")
		} else {
			normalized := NormalizeClientLicenseCode(trimmed)
			query = query.Where("code LIKE ? OR name LIKE ?", normalized+"%", trimmed+"%")
		}
	}

	if err = query.Count(&total).Error; err != nil {
		tx.Rollback()
		return nil, 0, err
	}
	if err = query.Order("id desc").Limit(num).Offset(startIdx).Find(&licenses).Error; err != nil {
		tx.Rollback()
		return nil, 0, err
	}
	if err = tx.Commit().Error; err != nil {
		return nil, 0, err
	}
	return licenses, total, nil
}

func GetClientLicenseById(id int) (*ClientLicense, error) {
	if id == 0 {
		return nil, errors.New("id is required")
	}
	license := &ClientLicense{Id: id}
	err := DB.First(license, "id = ?", id).Error
	return license, err
}

func DeleteClientLicenseById(id int) error {
	if id == 0 {
		return errors.New("id is required")
	}
	license := ClientLicense{Id: id}
	if err := DB.Where(license).First(&license).Error; err != nil {
		return err
	}
	return license.Delete()
}

func (license *ClientLicense) Delete() error {
	return DB.Delete(license).Error
}
