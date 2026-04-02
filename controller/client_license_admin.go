package controller

import (
	"errors"
	"net/http"
	"strconv"
	"strings"
	"unicode/utf8"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type clientLicenseCreateRequest struct {
	Code           string `json:"code"`
	Name           string `json:"name"`
	Status         string `json:"status"`
	DeviceHash     string `json:"device_hash"`
	UnlimitedQuota bool   `json:"unlimited_quota"`
	Quota          int    `json:"quota"`
	DurationDays   int    `json:"duration_days"`
	ExpiredTime    int64  `json:"expired_time"`
	BatchCount     int    `json:"batch_count"`
	CodeLength     int    `json:"code_length"`
}

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
	req := clientLicenseCreateRequest{}
	if err := c.ShouldBindJSON(&req); err != nil {
		common.ApiError(c, err)
		return
	}
	if valid, msg := validateClientLicenseCreateRequest(&req); !valid {
		common.ApiErrorMsg(c, msg)
		return
	}

	count := req.BatchCount
	if count <= 0 {
		count = 1
	}
	generatedCodes := make([]string, 0, count)
	createdLicenses := make([]*model.ClientLicense, 0, count)
	seenCodes := make(map[string]struct{}, count)

	for i := 0; i < count; i++ {
		code, err := resolveClientLicenseCode(&req, i, seenCodes)
		if err != nil {
			common.ApiError(c, err)
			return
		}

		license := &model.ClientLicense{
			Code:           code,
			Name:           buildClientLicenseName(req.Name, code, count, i),
			Status:         firstNonEmpty(strings.TrimSpace(req.Status), model.ClientLicenseStatusActive),
			DeviceHash:     strings.TrimSpace(req.DeviceHash),
			UnlimitedQuota: req.UnlimitedQuota,
			Quota:          req.Quota,
			DurationDays:   req.DurationDays,
			ExpiredTime:    req.ExpiredTime,
		}

		if valid, msg := validateClientLicensePayload(license, true); !valid {
			common.ApiErrorMsg(c, msg)
			return
		}
		if err := license.Insert(); err != nil {
			common.ApiError(c, err)
			return
		}

		generatedCodes = append(generatedCodes, license.Code)
		createdLicenses = append(createdLicenses, license)
		seenCodes[license.Code] = struct{}{}
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data": gin.H{
			"items": createdLicenses,
			"codes": generatedCodes,
			"count": len(createdLicenses),
		},
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
	current.DurationDays = license.DurationDays
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
	if license.DurationDays < 0 {
		return false, "license duration_days cannot be negative"
	}
	if license.DurationDays > 0 && license.ExpiredTime > 0 {
		return false, "license duration_days and expired_time cannot both be set"
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

func validateClientLicenseCreateRequest(req *clientLicenseCreateRequest) (bool, string) {
	count := req.BatchCount
	if count <= 0 {
		count = 1
	}
	if count > 200 {
		return false, "batch_count cannot exceed 200"
	}
	if count > 1 && strings.TrimSpace(req.Code) != "" {
		return false, "manual code is only supported when batch_count is 1"
	}
	req.CodeLength = model.NormalizeClientLicenseCodeLength(req.CodeLength)
	return true, ""
}

func resolveClientLicenseCode(req *clientLicenseCreateRequest, index int, seen map[string]struct{}) (string, error) {
	if strings.TrimSpace(req.Code) != "" {
		return model.NormalizeClientLicenseCode(req.Code), nil
	}

	for i := 0; i < 10; i++ {
		code, err := model.GenerateClientLicenseCode(req.CodeLength)
		if err != nil {
			return "", err
		}
		if _, exists := seen[code]; exists {
			continue
		}
		if _, err := model.GetClientLicenseByCode(code); err == nil {
			continue
		} else if !errorsIsNotFound(err) {
			return "", err
		}
		return code, nil
	}
	return "", errors.New("failed to generate unique client license code")
}

func buildClientLicenseName(baseName, code string, count, index int) string {
	name := strings.TrimSpace(baseName)
	if name == "" {
		return code
	}
	if count <= 1 {
		return name
	}
	return name + "-" + strconv.Itoa(index+1)
}
