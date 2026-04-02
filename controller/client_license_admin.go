package controller

import (
	"errors"
	"net/http"
	"strconv"
	"unicode/utf8"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

func GetAllClientLicenses(c *gin.Context) {
	pageInfo := common.GetPageQuery(c)
	licenses, total, err := model.GetAllClientLicenses(pageInfo.GetStartIdx(), pageInfo.GetPageSize())
	if err != nil {
		common.ApiError(c, err)
		return
	}
	pageInfo.SetTotal(int(total))
	pageInfo.SetItems(licenses)
	common.ApiSuccess(c, pageInfo)
}

func SearchClientLicenses(c *gin.Context) {
	pageInfo := common.GetPageQuery(c)
	keyword := c.Query("keyword")
	licenses, total, err := model.SearchClientLicenses(keyword, pageInfo.GetStartIdx(), pageInfo.GetPageSize())
	if err != nil {
		common.ApiError(c, err)
		return
	}
	pageInfo.SetTotal(int(total))
	pageInfo.SetItems(licenses)
	common.ApiSuccess(c, pageInfo)
}

func GetClientLicense(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		common.ApiError(c, err)
		return
	}
	license, err := model.GetClientLicenseById(id)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    license,
	})
}

func AddClientLicense(c *gin.Context) {
	license := model.ClientLicense{}
	if err := c.ShouldBindJSON(&license); err != nil {
		common.ApiError(c, err)
		return
	}
	if valid, msg := validateClientLicensePayload(&license, true); !valid {
		common.ApiErrorMsg(c, msg)
		return
	}
	if err := license.Insert(); err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    &license,
	})
}

func UpdateClientLicense(c *gin.Context) {
	license := model.ClientLicense{}
	if err := c.ShouldBindJSON(&license); err != nil {
		common.ApiError(c, err)
		return
	}
	if license.Id == 0 {
		common.ApiErrorMsg(c, "license id is required")
		return
	}
	if valid, msg := validateClientLicensePayload(&license, false); !valid {
		common.ApiErrorMsg(c, msg)
		return
	}

	current, err := model.GetClientLicenseById(license.Id)
	if err != nil {
		common.ApiError(c, err)
		return
	}

	current.Code = license.Code
	current.Name = license.Name
	current.Status = license.Status
	current.DeviceHash = license.DeviceHash
	current.UnlimitedQuota = license.UnlimitedQuota
	current.Quota = license.Quota
	current.ExpiredTime = license.ExpiredTime

	if err := current.Update(); err != nil {
		common.ApiError(c, err)
		return
	}
	if _, err := syncClientLicenseToken(current, nil); err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    current,
	})
}

func DeleteClientLicense(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		common.ApiError(c, err)
		return
	}
	license, err := model.GetClientLicenseById(id)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if license.TokenId > 0 {
		disableClientLicenseTokenIfNeeded(license)
	}
	if err := model.DeleteClientLicenseById(id); err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
	})
}

func validateClientLicensePayload(license *model.ClientLicense, creating bool) (bool, string) {
	license.Normalize()

	if license.Code == "" {
		return false, "license code is required"
	}
	if utf8.RuneCountInString(license.Code) > 64 {
		return false, "license code is too long"
	}
	if utf8.RuneCountInString(license.Name) > 64 {
		return false, "license name is too long"
	}
	if license.Status != model.ClientLicenseStatusActive && license.Status != model.ClientLicenseStatusDisabled {
		return false, "invalid license status"
	}
	if license.Quota < 0 {
		return false, "license quota cannot be negative"
	}
	if license.ExpiredTime != 0 && license.ExpiredTime < common.GetTimestamp() {
		return false, "license expired_time is invalid"
	}

	existing, err := model.GetClientLicenseByCode(license.Code)
	if err == nil {
		if creating || existing.Id != license.Id {
			return false, "license code already exists"
		}
	} else if !errorsIsNotFound(err) {
		return false, err.Error()
	}

	return true, ""
}

func errorsIsNotFound(err error) bool {
	return err == nil || errors.Is(err, gorm.ErrRecordNotFound)
}
