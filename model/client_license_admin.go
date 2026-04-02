package model

import (
	"errors"
	"strconv"
	"strings"
)

func GetAllClientLicenses(startIdx int, num int) (licenses []*ClientLicense, total int64, err error) {
	tx := DB.Begin()
	if tx.Error != nil {
		return nil, 0, tx.Error
	}
	defer func() {
		if r := recover(); r != nil {
			tx.Rollback()
		}
	}()

	if err = tx.Model(&ClientLicense{}).Count(&total).Error; err != nil {
		tx.Rollback()
		return nil, 0, err
	}
	if err = tx.Order("id desc").Limit(num).Offset(startIdx).Find(&licenses).Error; err != nil {
		tx.Rollback()
		return nil, 0, err
	}
	if err = tx.Commit().Error; err != nil {
		return nil, 0, err
	}
	return licenses, total, nil
}

func SearchClientLicenses(keyword string, startIdx int, num int) (licenses []*ClientLicense, total int64, err error) {
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
	query := tx.Model(&ClientLicense{})
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
