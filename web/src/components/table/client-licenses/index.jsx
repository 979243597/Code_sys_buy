/*
Copyright (C) 2025 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  API,
  copy,
  downloadTextAsFile,
  showError,
  showSuccess,
  timestamp2string,
} from '../../../helpers';
import { getQuotaPerUnit } from '../../../helpers/quota';
import { ITEMS_PER_PAGE } from '../../../constants';
import { useTableCompactMode } from '../../../hooks/common/useTableCompactMode';
import { useIsMobile } from '../../../hooks/common/useIsMobile';
import { createCardProPagination } from '../../../helpers/utils';
import CardPro from '../../common/ui/CardPro';
import CardTable from '../../common/ui/CardTable';
import CompactModeToggle from '../../common/ui/CompactModeToggle';
import {
  Avatar,
  Button,
  Card,
  Col,
  Dropdown,
  Empty,
  Form,
  Modal,
  Popover,
  Row,
  SideSheet,
  Space,
  Spin,
  Tag,
  Typography,
} from '@douyinfe/semi-ui';
import {
  IllustrationNoResult,
  IllustrationNoResultDark,
} from '@douyinfe/semi-illustrations';
import {
  IconClose,
  IconCreditCard,
  IconDownload,
  IconKey,
  IconMore,
  IconSave,
  IconSearch,
} from '@douyinfe/semi-icons';
import { KeyRound } from 'lucide-react';

const CLIENT_LICENSE_STATUS = {
  ACTIVE: 'active',
  DISABLED: 'disabled',
};

const CLIENT_LICENSE_ACTIONS = {
  DELETE: 'delete',
  ENABLE: 'enable',
  DISABLE: 'disable',
};

const CLIENT_COMPAT_OPTION_FIELDS = [
  'AIDeployerClientEnabled',
  'AIDeployerClientNotice',
  'AIDeployerClientMinVersion',
  'AIDeployerClientLatestVersion',
  'AIDeployerClientUpdateURL',
  'AIDeployerClientDefaultModel',
  'AIDeployerClientDefaultOCModel',
  'AIDeployerClientDefaultSmallModel',
];

const generateClientLicenseCode = (length = 8) => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const normalizedLength = Math.max(4, Math.min(32, Number(length) || 8));
  const buildPart = () =>
    Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  let raw = Array.from({ length: normalizedLength }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  const parts = [];
  while (raw.length > 4) {
    parts.push(raw.slice(0, 4));
    raw = raw.slice(4);
  }
  if (raw) parts.push(raw);
  return `CDX-${parts.join('-')}`;
};

const normalizeBooleanValue = (value, fallback = false) => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
    if (['false', '0', 'no', 'off', ''].includes(normalized)) return false;
  }
  if (typeof value === 'number') return value !== 0;
  if (value == null) return fallback;
  return Boolean(value);
};

const currentUnix = () => Math.floor(Date.now() / 1000);

const quotaToUsdAmount = (quota) => {
  const numericQuota = Number(quota || 0);
  const quotaPerUnit = getQuotaPerUnit();
  if (!Number.isFinite(numericQuota) || numericQuota <= 0 || !quotaPerUnit) return 0;
  return Number((numericQuota / quotaPerUnit).toFixed(2));
};

const usdAmountToQuota = (amount) => {
  const numericAmount = Number(amount || 0);
  const quotaPerUnit = getQuotaPerUnit();
  if (!Number.isFinite(numericAmount) || numericAmount <= 0 || !quotaPerUnit) return 0;
  return Math.round(numericAmount * quotaPerUnit);
};

const formatUsdQuota = (quota, digits = 2) => {
  const numericQuota = Number(quota || 0);
  const quotaPerUnit = getQuotaPerUnit();
  if (!Number.isFinite(numericQuota) || numericQuota <= 0 || !quotaPerUnit) return '$0.00';
  const resultUsd = numericQuota / quotaPerUnit;
  const fixedResult = resultUsd.toFixed(digits);
  if (parseFloat(fixedResult) === 0 && resultUsd > 0) {
    const minValue = Math.pow(10, -digits);
    return `$${minValue.toFixed(digits)}`;
  }
  return `$${fixedResult}`;
};

const getEffectiveExpiredTime = (record) => {
  if (!record) return 0;
  if (record.expired_time > 0) return record.expired_time;
  if (record.duration_days > 0 && record.activated_time > 0) {
    return record.activated_time + record.duration_days * 86400;
  }
  return 0;
};

const isExpired = (record) =>
  record?.status === CLIENT_LICENSE_STATUS.ACTIVE &&
  getEffectiveExpiredTime(record) > 0 &&
  getEffectiveExpiredTime(record) < currentUnix();

const isActivated = (record) =>
  !!record && ((record.activated_time || 0) > 0 || (record.last_redeem_time || 0) > 0);

const statusTag = (record, t) => {
  if (isExpired(record)) {
    return { color: 'orange', text: t('已过期') };
  }
  if (record?.status === CLIENT_LICENSE_STATUS.DISABLED) {
    return { color: 'red', text: t('已禁用') };
  }
  return { color: 'green', text: t('生效中') };
};

const activationTag = (record, t) => {
  if (isActivated(record)) {
    return { color: 'blue', text: t('已激活') };
  }
  return { color: 'grey', text: t('未激活') };
};

const maskText = (text) => {
  const value = (text || '').trim();
  if (!value) return '-';
  if (value.length <= 12) return value;
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
};

const formatTime = (value, t, emptyText = '未设置') => {
  if (!value || value === 0) return t(emptyText);
  return timestamp2string(value);
};

const formatExpires = (record, t) => {
  const effectiveExpiredTime = getEffectiveExpiredTime(record);
  if (effectiveExpiredTime > 0) {
    return timestamp2string(effectiveExpiredTime);
  }
  if (record?.duration_days > 0) {
    return t('激活后 {{count}} 天', { count: record.duration_days });
  }
  return t('永不过期');
};

const formatSubscriptionResetPeriod = (record, t) => {
  const period = record?.subscription_quota_reset_period || '';
  if (!period) return '-';
  if (period === 'daily') return t('每天');
  if (period === 'weekly') return t('每周');
  if (period === 'monthly') return t('每月');
  if (period === 'custom') {
    const seconds = Number(record?.subscription_quota_reset_custom_seconds || 0);
    if (seconds >= 86400) return `${Math.floor(seconds / 86400)} ${t('天')}`;
    if (seconds >= 3600) return `${Math.floor(seconds / 3600)} ${t('小时')}`;
    if (seconds >= 60) return `${Math.floor(seconds / 60)} ${t('分钟')}`;
    return `${seconds} ${t('秒')}`;
  }
  return t('不重置');
};

const formatSubscriptionDuration = (record, t) => {
  const unit = record?.subscription_duration_unit || '';
  const value = Number(record?.subscription_duration_value || 0);
  const customSeconds = Number(record?.subscription_custom_seconds || 0);
  if (unit === 'year' && value > 0) return `${value}${t('骞?')}`;
  if (unit === 'month' && value > 0) return `${value}${t('鏈?')}`;
  if (unit === 'day' && value > 0) return `${value}${t('澶?)}`;
  if (unit === 'hour' && value > 0) return `${value}${t('灏忔椂')}`;
  if (unit === 'custom' && customSeconds > 0) {
    if (customSeconds % 86400 === 0) return `${Math.floor(customSeconds / 86400)}${t('澶?)}`;
    if (customSeconds % 3600 === 0) return `${Math.floor(customSeconds / 3600)}${t('灏忔椂')}`;
    if (customSeconds % 60 === 0) return `${Math.floor(customSeconds / 60)}${t('鍒嗛挓')}`;
    return `${customSeconds}${t('绉?)}`;
  }
  return '-';
};

const formatSubscriptionTotalAmount = (quota, t) => {
  if (Number(quota || 0) <= 0) return t('涓嶉檺');
  return formatUsdQuota(quota);
};

const buildSubscriptionPlanOptionLabel = (item, t) => {
  const plan = item?.plan || {};
  const price = Number(plan.price_amount || 0).toFixed(2);
  const duration = formatSubscriptionDuration(
    {
      subscription_duration_unit: plan.duration_unit,
      subscription_duration_value: plan.duration_value,
      subscription_custom_seconds: plan.custom_seconds,
    },
    t,
  );
  const totalAmount = formatSubscriptionTotalAmount(plan.total_amount, t);
  const resetPeriod = formatSubscriptionResetPeriod(
    {
      subscription_quota_reset_period: plan.quota_reset_period,
      subscription_quota_reset_custom_seconds: plan.quota_reset_custom_seconds,
    },
    t,
  );
  return `${plan.title || '-'} · $${price} · ${duration} · ${totalAmount} / ${resetPeriod}`;
};

const formatSubscriptionStatusLabel = (status, t) => {
  if (!status) return '-';
  if (status === 'active') return t('鐢熸晥涓?);
  if (status === 'cancelled') return t('宸插彇娑?);
  if (status === 'expired') return t('宸茶繃鏈?);
  if (status === 'pending') return t('寰呮縺娲?);
  return status;
};

const useClientLicensesData = () => {
  const { t } = useTranslation();
  const [licenses, setLicenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [activePage, setActivePage] = useState(1);
  const [pageSize, setPageSize] = useState(ITEMS_PER_PAGE);
  const [total, setTotal] = useState(0);
  const [selectedRows, setSelectedRows] = useState([]);
  const [editingLicense, setEditingLicense] = useState({ id: undefined });
  const [showEdit, setShowEdit] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [deletingRecord, setDeletingRecord] = useState(null);
  const [formApi, setFormApi] = useState(null);
  const [compactMode, setCompactMode] = useTableCompactMode('client-licenses');

  const formInitValues = {
    searchKeyword: '',
  };

  const getSearchKeyword = () => {
    const values = formApi ? formApi.getValues() : {};
    return values.searchKeyword || '';
  };

  const loadLicenses = async (page = 1, size = pageSize) => {
    setLoading(true);
    try {
      const res = await API.get(`/api/client_license/?p=${page}&page_size=${size}`);
      const { success, message, data } = res.data;
      if (success) {
        setLicenses(data.items || []);
        setActivePage(data.page <= 0 ? 1 : data.page);
        setTotal(data.total || 0);
      } else {
        showError(message);
      }
    } catch (error) {
      showError(error.message);
    } finally {
      setLoading(false);
    }
  };

  const searchLicenses = async (page = 1, size = pageSize) => {
    const keyword = getSearchKeyword();
    if (!keyword) {
      await loadLicenses(page, size);
      return;
    }

    setSearching(true);
    try {
      const res = await API.get(
        `/api/client_license/search?keyword=${encodeURIComponent(keyword)}&p=${page}&page_size=${size}`,
      );
      const { success, message, data } = res.data;
      if (success) {
        setLicenses(data.items || []);
        setActivePage(data.page || 1);
        setTotal(data.total || 0);
      } else {
        showError(message);
      }
    } catch (error) {
      showError(error.message);
    } finally {
      setSearching(false);
    }
  };

  const refresh = async (page = activePage) => {
    if (getSearchKeyword()) {
      await searchLicenses(page, pageSize);
    } else {
      await loadLicenses(page, pageSize);
    }
  };

  const handlePageChange = (page) => {
    setActivePage(page);
    if (getSearchKeyword()) {
      searchLicenses(page, pageSize);
    } else {
      loadLicenses(page, pageSize);
    }
  };

  const handlePageSizeChange = (size) => {
    setPageSize(size);
    setActivePage(1);
    if (getSearchKeyword()) {
      searchLicenses(1, size);
    } else {
      loadLicenses(1, size);
    }
  };

  const manageLicense = async (record, action) => {
    setLoading(true);
    try {
      let res;
      if (action === CLIENT_LICENSE_ACTIONS.DELETE) {
        res = await API.delete(`/api/client_license/${record.id}`);
      } else {
        const nextStatus =
          action === CLIENT_LICENSE_ACTIONS.DISABLE
            ? CLIENT_LICENSE_STATUS.DISABLED
            : CLIENT_LICENSE_STATUS.ACTIVE;
        res = await API.put('/api/client_license/', {
          ...record,
          status: nextStatus,
        });
      }
      const { success, message } = res.data;
      if (success) {
        showSuccess(t('操作成功完成！'));
        await refresh();
      } else {
        showError(message);
      }
    } catch (error) {
      showError(error.message);
    } finally {
      setLoading(false);
    }
  };

  const copyText = async (text) => {
    if (await copy(text)) {
      showSuccess(t('已复制到剪贴板！'));
    } else {
      Modal.error({
        title: t('无法复制到剪贴板，请手动复制'),
        content: text,
        size: 'large',
      });
    }
  };

  const batchCopyLicenses = async () => {
    if (selectedRows.length === 0) {
      showError(t('请至少选择一个客户端卡密！'));
      return;
    }
    const text = selectedRows.map((item) => `${item.name || item.code}    ${item.code}`).join('\n');
    await copyText(text);
  };

  const batchExportLicenses = async () => {
    const exportRows = selectedRows.length > 0 ? selectedRows : licenses;
    if (exportRows.length === 0) {
      showError(t('当前没有可导出的卡密数据'));
      return;
    }
    const header = [
      'id',
      'name',
      'code',
      'activation_status',
      'card_status',
      'unlimited_quota',
      'quota_usd',
      'quota_raw',
      'duration_days',
      'created_time',
      'activated_time',
      'last_redeem_time',
      'effective_expired_time',
      'device_hash',
      'token_id',
      'user_id',
    ];
    const lines = exportRows.map((item) =>
      [
        item.id,
        `"${(item.name || item.code || '').replaceAll('"', '""')}"`,
        `"${(item.code || '').replaceAll('"', '""')}"`,
        isActivated(item) ? 'activated' : 'pending',
        item.status || '',
        item.unlimited_quota ? 'true' : 'false',
        item.unlimited_quota ? 'unlimited' : quotaToUsdAmount(item.quota ?? 0).toFixed(2),
        item.quota ?? 0,
        item.duration_days ?? 0,
        item.created_time ?? 0,
        item.activated_time ?? 0,
        item.last_redeem_time ?? 0,
        getEffectiveExpiredTime(item),
        `"${(item.device_hash || '').replaceAll('"', '""')}"`,
        item.token_id ?? 0,
        item.user_id ?? 0,
      ].join(','),
    );
    downloadTextAsFile(
      [header.join(','), ...lines].join('\n'),
      `client-licenses-${new Date().toISOString().slice(0, 10)}.csv`,
    );
    showSuccess(
      selectedRows.length > 0
        ? t('已导出所选卡密')
        : t('已导出当前页卡密'),
    );
  };

  const rowSelection = {
    onChange: (selectedRowKeys, rows) => {
      setSelectedRows(rows);
    },
  };

  const handleRow = (record) => {
    if (record.status !== CLIENT_LICENSE_STATUS.ACTIVE || isExpired(record)) {
      return {
        style: {
          background: 'var(--semi-color-disabled-border)',
        },
      };
    }
    return {};
  };

  const closeEdit = () => {
    setShowEdit(false);
    setTimeout(() => setEditingLicense({ id: undefined }), 300);
  };

  useEffect(() => {
    loadLicenses(1, pageSize).catch((reason) => showError(reason));
  }, [pageSize]);

  return {
    t,
    licenses,
    loading,
    searching,
    activePage,
    pageSize,
    total,
    selectedRows,
    editingLicense,
    showEdit,
    setShowEdit,
    setEditingLicense,
    showDelete,
    setShowDelete,
    deletingRecord,
    setDeletingRecord,
    formInitValues,
    setFormApi,
    searchLicenses,
    refresh,
    compactMode,
    setCompactMode,
    manageLicense,
    copyText,
    batchCopyLicenses,
    batchExportLicenses,
    handlePageChange,
    handlePageSizeChange,
    rowSelection,
    handleRow,
    closeEdit,
  };
};

const ClientLicensesDescription = ({
  compactMode,
  setCompactMode,
  t,
  total,
  activatedCount,
  enabledCount,
}) => (
  <div className='flex flex-col md:flex-row justify-between items-start md:items-center gap-2 w-full'>
    <div className='flex flex-col gap-2'>
      <div className='flex items-center text-orange-500'>
        <KeyRound size={16} className='mr-2' />
        <Typography.Text>{t('客户端卡密管理')}</Typography.Text>
      </div>
      <div className='flex flex-wrap gap-2'>
        <Tag color='blue' shape='circle' size='small'>
          {t('总数')} {total}
        </Tag>
        <Tag color='cyan' shape='circle' size='small'>
          {t('已激活')} {activatedCount}
        </Tag>
        <Tag color='green' shape='circle' size='small'>
          {t('可用中')} {enabledCount}
        </Tag>
      </div>
    </div>
    <CompactModeToggle compactMode={compactMode} setCompactMode={setCompactMode} t={t} />
  </div>
);

const ClientCompatSettingsCard = ({ t }) => {
  const formApiRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [snapshot, setSnapshot] = useState({});

  const getInitValues = () => ({
    AIDeployerClientEnabled: true,
    AIDeployerClientNotice: '',
    AIDeployerClientMinVersion: '1.0.0',
    AIDeployerClientLatestVersion: '1.0.4',
    AIDeployerClientUpdateURL: '',
    AIDeployerClientDefaultModel: 'gpt-5.3-codex',
    AIDeployerClientDefaultOCModel: 'openai/gpt-5.3-codex',
    AIDeployerClientDefaultSmallModel: 'openai/gpt-4.1-mini',
  });

  const loadSettings = async () => {
    setLoading(true);
    try {
      const res = await API.get('/api/option/');
      const { success, message, data } = res.data;
      if (!success) {
        showError(message || t('加载失败，请重试'));
        return;
      }
      const optionMap = (data || []).reduce((acc, item) => {
        acc[item.key] = item.value;
        return acc;
      }, {});
      const nextValues = {
        ...getInitValues(),
        AIDeployerClientEnabled:
          String(optionMap.AIDeployerClientEnabled ?? 'true') === 'true',
        AIDeployerClientNotice: optionMap.AIDeployerClientNotice || '',
        AIDeployerClientMinVersion:
          optionMap.AIDeployerClientMinVersion || '1.0.0',
        AIDeployerClientLatestVersion:
          optionMap.AIDeployerClientLatestVersion || '1.0.4',
        AIDeployerClientUpdateURL: optionMap.AIDeployerClientUpdateURL || '',
        AIDeployerClientDefaultModel:
          optionMap.AIDeployerClientDefaultModel || 'gpt-5.3-codex',
        AIDeployerClientDefaultOCModel:
          optionMap.AIDeployerClientDefaultOCModel || 'openai/gpt-5.3-codex',
        AIDeployerClientDefaultSmallModel:
          optionMap.AIDeployerClientDefaultSmallModel || 'openai/gpt-4.1-mini',
      };
      setSnapshot(nextValues);
      formApiRef.current?.setValues(nextValues);
    } catch (error) {
      showError(error.message || t('加载失败，请重试'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);

  const saveSettings = async () => {
    const values = formApiRef.current?.getValues() || {};
    const updates = CLIENT_COMPAT_OPTION_FIELDS.filter(
      (key) => values[key] !== snapshot[key],
    ).map((key) => ({
      key,
      value: typeof values[key] === 'boolean' ? String(values[key]) : values[key] || '',
    }));

    if (updates.length === 0) {
      showError(t('你似乎并没有修改什么'));
      return;
    }

    setSaving(true);
    try {
      const results = await Promise.all(
        updates.map((item) => API.put('/api/option/', item)),
      );
      const failed = results.find((item) => !item?.data?.success);
      if (failed) {
        throw new Error(failed?.data?.message || t('保存失败，请重试'));
      }
      showSuccess(t('客户端远端配置已保存'));
      await loadSettings();
    } catch (error) {
      showError(error.message || t('保存失败，请重试'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className='!rounded-2xl shadow-sm border-0 mb-6'>
      <div className='flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4'>
        <div>
          <Typography.Text strong>{t('客户端远端配置')}</Typography.Text>
          <div className='text-xs text-gray-600 mt-1'>
            {t('控制 AI Deployer 客户端启动时的停用提示、版本检查、更新地址与默认模型')}
          </div>
        </div>
        <Button theme='solid' onClick={saveSettings} loading={saving} icon={<IconSave />}>
          {t('保存配置')}
        </Button>
      </div>

      <Spin spinning={loading}>
        <Form
          initValues={getInitValues()}
          getFormApi={(api) => {
            formApiRef.current = api;
          }}
        >
          <Row gutter={12}>
            <Col span={24}>
              <Form.Switch
                field='AIDeployerClientEnabled'
                label={t('启用客户端服务')}
                checkedText={t('开')}
                uncheckedText={t('关')}
              />
            </Col>
            <Col span={12}>
              <Form.Input
                field='AIDeployerClientMinVersion'
                label={t('最低版本')}
                placeholder='1.0.5'
                showClear
              />
            </Col>
            <Col span={12}>
              <Form.Input
                field='AIDeployerClientLatestVersion'
                label={t('最新版本')}
                placeholder='1.0.6'
                showClear
              />
            </Col>
            <Col span={24}>
              <Form.Input
                field='AIDeployerClientUpdateURL'
                label={t('更新地址')}
                placeholder='https://your-domain.example/downloads/ai-deployer'
                showClear
              />
            </Col>
            <Col span={24}>
              <Form.TextArea
                field='AIDeployerClientNotice'
                label={t('提示文案')}
                autosize={{ minRows: 3, maxRows: 6 }}
                placeholder={t('例如：当前版本过旧，请升级后继续使用')}
                showClear
              />
            </Col>
            <Col span={24} md={12}>
              <Form.Input
                field='AIDeployerClientDefaultModel'
                label={t('默认 Codex 模型')}
                placeholder='gpt-5.3-codex'
                showClear
              />
            </Col>
            <Col span={24} md={12}>
              <Form.Input
                field='AIDeployerClientDefaultOCModel'
                label={t('默认 OpenCode 模型')}
                placeholder='openai/gpt-5.3-codex'
                showClear
              />
            </Col>
            <Col span={24}>
              <Form.Input
                field='AIDeployerClientDefaultSmallModel'
                label={t('默认小模型')}
                placeholder='openai/gpt-4.1-mini'
                showClear
              />
            </Col>
          </Row>
        </Form>
      </Spin>
    </Card>
  );
};

const ClientLicensesFilters = ({
  formInitValues,
  setFormApi,
  searchLicenses,
  loading,
  searching,
  t,
}) => {
  const formApiRef = useRef(null);

  const handleReset = () => {
    if (!formApiRef.current) return;
    formApiRef.current.reset();
    setTimeout(() => {
      searchLicenses();
    }, 100);
  };

  return (
    <Form
      initValues={formInitValues}
      getFormApi={(api) => {
        setFormApi(api);
        formApiRef.current = api;
      }}
      onSubmit={() => searchLicenses(1)}
      allowEmpty={true}
      autoComplete='off'
      layout='horizontal'
      className='w-full md:w-auto order-1 md:order-2'
    >
      <div className='flex flex-col md:flex-row items-center gap-2 w-full md:w-auto'>
        <div className='relative w-full md:w-64'>
          <Form.Input
            field='searchKeyword'
            prefix={<IconSearch />}
            placeholder={t('关键字：ID / 卡密 / 名称')}
            showClear
            pure
            size='small'
          />
        </div>
        <div className='flex gap-2 w-full md:w-auto'>
          <Button
            type='tertiary'
            htmlType='submit'
            loading={loading || searching}
            className='flex-1 md:flex-initial md:w-auto'
            size='small'
          >
            {t('查询')}
          </Button>
          <Button
            type='tertiary'
            onClick={handleReset}
            className='flex-1 md:flex-initial md:w-auto'
            size='small'
          >
            {t('重置')}
          </Button>
        </div>
      </div>
    </Form>
  );
};

const ClientLicensesActions = ({
  setEditingLicense,
  setShowEdit,
  batchCopyLicenses,
  batchExportLicenses,
  t,
}) => {
  const handleAdd = () => {
    setEditingLicense({ id: undefined });
    setShowEdit(true);
  };

  return (
    <div className='flex flex-wrap gap-2 w-full md:w-auto order-2 md:order-1'>
      <Button type='primary' className='flex-1 md:flex-initial' onClick={handleAdd} size='small'>
        {t('添加客户端卡密')}
      </Button>
      <Button
        type='tertiary'
        className='flex-1 md:flex-initial'
        onClick={batchCopyLicenses}
        size='small'
      >
        {t('批量复制')}
      </Button>
      <Button
        type='tertiary'
        className='flex-1 md:flex-initial'
        onClick={batchExportLicenses}
        size='small'
        icon={<IconDownload />}
      >
        {t('批量导出')}
      </Button>
    </div>
  );
};

const DeleteClientLicenseModal = ({
  visible,
  onCancel,
  record,
  manageLicense,
  refresh,
  licenses,
  activePage,
  t,
}) => {
  const handleConfirm = async () => {
    await manageLicense(record, CLIENT_LICENSE_ACTIONS.DELETE);
    await refresh();
    setTimeout(() => {
      if (licenses.length === 0 && activePage > 1) {
        refresh(activePage - 1);
      }
    }, 100);
    onCancel();
  };

  return (
    <Modal
      title={t('确定是否要删除此客户端卡密？')}
      visible={visible}
      onCancel={onCancel}
      onOk={handleConfirm}
      type='warning'
    >
      {t('此修改将不可逆。')}
    </Modal>
  );
};

const EditClientLicenseModal = ({ editingLicense, visible, onClose, refresh, t }) => {
  const isEdit = editingLicense.id !== undefined;
  const isMobile = useIsMobile();
  const [loading, setLoading] = useState(isEdit);
  const [plansLoading, setPlansLoading] = useState(false);
  const [subscriptionPlans, setSubscriptionPlans] = useState([]);
  const formApiRef = useRef(null);

  const getInitValues = () => ({
    code: '',
    name: '',
    subscription_plan_id: 0,
    unlimited_quota: true,
    quota: 0,
    device_hash: '',
    batch_count: 1,
    code_length: 8,
    duration_days: 0,
    expired_time: null,
  });

  const loadLicense = async () => {
    setLoading(true);
    const res = await API.get(`/api/client_license/${editingLicense.id}`);
    const { success, message, data } = res.data;
    if (success) {
      formApiRef.current?.setValues({
        ...getInitValues(),
        ...data,
        subscription_plan_id: data.subscription_plan_id || 0,
        quota: quotaToUsdAmount(data.quota || 0),
        expired_time: data.expired_time === 0 ? null : new Date(data.expired_time * 1000),
      });
    } else {
      showError(message);
    }
    setLoading(false);
  };

  const loadSubscriptionPlans = async () => {
    setPlansLoading(true);
    try {
      const res = await API.get('/api/subscription/admin/plans');
      const { success, message, data } = res.data;
      if (success) {
        setSubscriptionPlans(data || []);
      } else {
        showError(message);
      }
    } catch (error) {
      showError(error.message);
    } finally {
      setPlansLoading(false);
    }
  };

  useEffect(() => {
    if (!formApiRef.current) return;
    loadSubscriptionPlans();
    if (isEdit) {
      loadLicense();
    } else {
      formApiRef.current.setValues(getInitValues());
      setLoading(false);
    }
  }, [editingLicense.id, visible]);

  const submit = async (values) => {
    setLoading(true);
    const payload = {
      ...values,
      code:
        !isEdit && (parseInt(values.batch_count, 10) || 1) > 1
          ? ''
          : (values.code || '').trim(),
      name: (values.name || values.code || '').trim(),
      unlimited_quota: normalizeBooleanValue(values.unlimited_quota, true),
      quota: usdAmountToQuota(values.quota),
      subscription_plan_id: parseInt(values.subscription_plan_id, 10) || 0,
      batch_count: parseInt(values.batch_count, 10) || 1,
      code_length: parseInt(values.code_length, 10) || 8,
      duration_days: parseInt(values.duration_days, 10) || 0,
      expired_time: values.expired_time
        ? Math.floor(values.expired_time.getTime() / 1000)
        : 0,
    };
    let res;
    if (isEdit) {
      res = await API.put('/api/client_license/', {
        ...payload,
        id: parseInt(editingLicense.id, 10),
      });
    } else {
      res = await API.post('/api/client_license/', payload);
    }

    const { success, message } = res.data;
    if (success) {
      const generatedCodes = res.data?.data?.codes || [];
      showSuccess(isEdit ? t('客户端卡密更新成功！') : t('客户端卡密创建成功！'));
      await refresh();
      onClose();

      if (!isEdit && generatedCodes.length > 0) {
        const text = generatedCodes.join('\n');
        Modal.confirm({
          title: t('客户端卡密创建成功'),
          content: (
            <div>
              <p>{t('本次共生成 {{count}} 个卡密。', { count: generatedCodes.length })}</p>
              <p>{t('是否下载卡密列表文件？')}</p>
            </div>
          ),
          onOk: () => {
            downloadTextAsFile(text, `${payload.name || 'client-licenses'}.txt`);
          },
        });
      }
    } else {
      showError(message);
    }
    setLoading(false);
  };

  return (
    <SideSheet
      placement={isEdit ? 'right' : 'left'}
      visible={visible}
      width={isMobile ? '100%' : 640}
      onCancel={onClose}
      closeIcon={null}
      title={
        <Space>
          <Tag color={isEdit ? 'blue' : 'green'} shape='circle'>
            {isEdit ? t('更新') : t('新建')}
          </Tag>
          <Typography.Title heading={4} className='m-0'>
            {isEdit ? t('更新客户端卡密') : t('创建新的客户端卡密')}
          </Typography.Title>
        </Space>
      }
      footer={
        <div className='flex justify-end bg-white'>
          <Space>
            <Button
              theme='solid'
              onClick={() => formApiRef.current?.submitForm()}
              icon={<IconSave />}
              loading={loading}
            >
              {t('提交')}
            </Button>
            <Button theme='light' type='primary' onClick={onClose} icon={<IconClose />}>
              {t('取消')}
            </Button>
          </Space>
        </div>
      }
    >
      <Spin spinning={loading}>
        <Form
          initValues={getInitValues()}
          getFormApi={(api) => {
            formApiRef.current = api;
          }}
          onSubmit={submit}
        >
          {({ values }) => {
            const selectedSubscriptionPlan = (subscriptionPlans || []).find(
              (item) => Number(item?.plan?.id || 0) === (parseInt(values.subscription_plan_id, 10) || 0),
            );
            return (
            <div className='p-2'>
              <Card className='!rounded-2xl shadow-sm border-0 mb-6'>
                <div className='mb-3 flex items-center'>
                  <Avatar size='small' color='blue' className='mr-2 shadow-md'>
                    <IconKey size='small' />
                  </Avatar>
                  <div>
                    <Typography.Text strong>{t('卡密信息')}</Typography.Text>
                    <div className='text-xs text-gray-600'>
                      {t('配置卡密编码、批量生成规则与固定过期时间')}
                    </div>
                  </div>
                </div>
                <Row gutter={12}>
                  <Col span={24}>
                    <Form.Input
                      field='code'
                      label={t('卡密')}
                      placeholder={t('留空则自动生成；批量创建时必须留空')}
                      showClear
                      extraText={
                        <Button
                          type='tertiary'
                          size='small'
                          disabled={isEdit ? false : (Number(values.batch_count) || 1) > 1}
                          onClick={() =>
                            formApiRef.current?.setValue(
                              'code',
                              generateClientLicenseCode(values.code_length),
                            )
                          }
                        >
                          {t('生成')}
                        </Button>
                      }
                    />
                  </Col>
                  <Col span={24}>
                    <Form.Input
                      field='name'
                      label={t('名称')}
                      placeholder={t('例如 starter / trial / annual')}
                      showClear
                    />
                  </Col>
                  <Col span={24}>
                    <Form.DatePicker
                      field='expired_time'
                      label={t('过期时间')}
                      type='dateTime'
                      placeholder={t('留空表示永不过期；如设置持续天数请留空')}
                      disabled={(Number(values.duration_days) || 0) > 0 || (Number(values.subscription_plan_id) || 0) > 0}
                      style={{ width: '100%' }}
                      showClear
                    />
                  </Col>
                  {!isEdit && (
                    <>
                      <Col span={12}>
                        <Form.InputNumber
                          field='batch_count'
                          label={t('生成数量')}
                          min={1}
                          max={200}
                          style={{ width: '100%' }}
                        />
                      </Col>
                      <Col span={12}>
                        <Form.InputNumber
                          field='code_length'
                          label={t('随机长度')}
                          min={4}
                          max={32}
                          style={{ width: '100%' }}
                          extraText={t('仅对自动生成卡密生效')}
                        />
                      </Col>
                    </>
                  )}
                  <Col span={24}>
                    <Form.InputNumber
                      field='duration_days'
                      label={t('持续天数')}
                      min={0}
                      disabled={(Number(values.subscription_plan_id) || 0) > 0}
                      style={{ width: '100%' }}
                      extraText={(Number(values.subscription_plan_id) || 0) > 0
                        ? t('已选择订阅套餐时，这个持续天数字段不生效')
                        : t('填 0 表示不用持续天数；大于 0 时从首次激活开始计时')}
                    />
                  </Col>
                </Row>
              </Card>

              <Card className='!rounded-2xl shadow-sm border-0 mb-6'>
                <div className='mb-3 flex items-center'>
                  <Avatar size='small' color='green' className='mr-2 shadow-md'>
                    <IconCreditCard size='small' />
                  </Avatar>
                  <div>
                    <Typography.Text strong>{t('额度配置')}</Typography.Text>
                    <div className='text-xs text-gray-600'>
                      {t('控制卡密激活后生成的令牌额度与有效策略')}
                    </div>
                  </div>
                </div>
                <Row gutter={12}>
                  <Col span={24}>
                    <Form.Select
                      field='subscription_plan_id'
                      label={t('订阅套餐')}
                      placeholder={plansLoading ? t('加载套餐中...') : t('不选则为普通额度卡')}
                      style={{ width: '100%' }}
                      optionList={(subscriptionPlans || []).map((item) => ({
                        label: buildSubscriptionPlanOptionLabel(item, t),
                        value: item?.plan?.id,
                      }))}
                      showClear
                    />
                    {selectedSubscriptionPlan ? (
                      <div className='mt-2 text-xs text-gray-600 rounded-xl bg-gray-50 px-3 py-2 border border-gray-200'>
                        <div>{selectedSubscriptionPlan?.plan?.subtitle || t('璁㈤槄鍗″皢鎸夋濂楅寮€閫氾紝棰濆害涓庡埌鏈熸椂闂翠互濂楅涓哄噯')}</div>
                        <div className='mt-1'>
                          {t('浠锋牸')}：${Number(selectedSubscriptionPlan?.plan?.price_amount || 0).toFixed(2)} ·
                          {' '}{t('鏈夋晥鏈?)}：{formatSubscriptionDuration(
                            {
                              subscription_duration_unit: selectedSubscriptionPlan?.plan?.duration_unit,
                              subscription_duration_value: selectedSubscriptionPlan?.plan?.duration_value,
                              subscription_custom_seconds: selectedSubscriptionPlan?.plan?.custom_seconds,
                            },
                            t,
                          )} ·
                          {' '}{t('鎬婚搴?)}：{formatSubscriptionTotalAmount(selectedSubscriptionPlan?.plan?.total_amount, t)} ·
                          {' '}{t('閲嶇疆')}：{formatSubscriptionResetPeriod(
                            {
                              subscription_quota_reset_period: selectedSubscriptionPlan?.plan?.quota_reset_period,
                              subscription_quota_reset_custom_seconds:
                                selectedSubscriptionPlan?.plan?.quota_reset_custom_seconds,
                            },
                            t,
                          )}
                        </div>
                      </div>
                    ) : null}
                  </Col>
                  <Col span={24}>
                    <Form.Switch
                      field='unlimited_quota'
                      label={t('无限额度')}
                      checkedText={t('开')}
                      uncheckedText={t('关')}
                      disabled={(Number(values.subscription_plan_id) || 0) > 0}
                    />
                  </Col>
                  <Col span={24}>
                    <Form.InputNumber
                      field='quota'
                      label={t('额度（USD）')}
                      min={0}
                      precision={2}
                      disabled={values.unlimited_quota || (Number(values.subscription_plan_id) || 0) > 0}
                      style={{ width: '100%' }}
                      extraText={(Number(values.subscription_plan_id) || 0) > 0
                        ? t('已选择订阅套餐时，这个额度字段不生效')
                        : `${t('按美元填写，保存时自动换算为原生额度')} · ${t('原生额度')}：${usdAmountToQuota(
                            values.quota,
                          )}`}
                    />
                  </Col>
                </Row>
              </Card>

              <Card className='!rounded-2xl shadow-sm border-0'>
                <div className='mb-3 flex items-center'>
                  <Avatar size='small' color='grey' className='mr-2 shadow-md'>
                    <IconKey size='small' />
                  </Avatar>
                  <div>
                    <Typography.Text strong>{t('设备绑定')}</Typography.Text>
                    <div className='text-xs text-gray-600'>
                      {t('可选：手动维护设备哈希，用于锁定或释放指定设备')}
                    </div>
                  </div>
                </div>
                <Row gutter={12}>
                  <Col span={24}>
                    <Form.Input
                      field='device_hash'
                      label={t('设备哈希')}
                      placeholder={t('留空表示未绑定设备')}
                      showClear
                    />
                  </Col>
                </Row>
              </Card>
            </div>
          );
          }}
        </Form>
      </Spin>
    </SideSheet>
  );
};

const ClientLicensesTable = ({
  licenses,
  loading,
  activePage,
  pageSize,
  total,
  compactMode,
  handlePageChange,
  handlePageSizeChange,
  rowSelection,
  handleRow,
  manageLicense,
  copyText,
  setEditingLicense,
  setShowEdit,
  setDeletingRecord,
  setShowDelete,
  t,
}) => {
  const columns = useMemo(
    () => [
      { title: t('ID'), dataIndex: 'id' },
      {
        title: t('卡密'),
        dataIndex: 'code',
        render: (text) => (
          <Popover content={text} position='top'>
            <Button type='tertiary' size='small'>
              {text}
            </Button>
          </Popover>
        ),
      },
      {
        title: t('名称'),
        dataIndex: 'name',
        render: (text, record) => text || record.code,
      },
      {
        title: t('激活状态'),
        dataIndex: 'activated_time',
        render: (text, record) => {
          const config = activationTag(record, t);
          return (
            <Tag color={config.color} shape='circle'>
              {config.text}
            </Tag>
          );
        },
      },
      {
        title: t('卡密状态'),
        dataIndex: 'status',
        render: (text, record) => {
          const config = statusTag(record, t);
          return (
            <Tag color={config.color} shape='circle'>
              {config.text}
            </Tag>
          );
        },
      },
      {
        title: t('额度（USD）'),
        dataIndex: 'quota',
        render: (text, record) =>
          record.unlimited_quota ? (
            <Tag color='green' shape='circle'>
              {t('无限额度')}
            </Tag>
          ) : (
            <Tag color='grey' shape='circle'>
              {formatUsdQuota(parseInt(text, 10) || 0)}
            </Tag>
          ),
      },
      {
        title: t('绑定设备'),
        dataIndex: 'device_hash',
        render: (text) => (
          <Popover content={text || t('未绑定')} position='top'>
            <span>{maskText(text)}</span>
          </Popover>
        ),
      },
      {
        title: t('关联令牌'),
        dataIndex: 'token_id',
        render: (text) => text || '-',
      },
      {
        title: t('归属用户'),
        dataIndex: 'user_id',
        render: (text) => text || '-',
      },
      {
        title: t('订阅计划'),
        dataIndex: 'subscription_plan_title',
        render: (text, record) =>
          record.subscription_plan_id ? (
            <Popover
              position='top'
              content={
                <div>
                  <div>{text || `#${record.subscription_plan_id}`}</div>
                  <div>{t('浠锋牸')}：${Number(record.subscription_price_amount || 0).toFixed(2)}</div>
                  <div>{t('鏈夋晥鏈?)}：{formatSubscriptionDuration(record, t)}</div>
                  <div>{t('总额度')}：{record.subscription_amount_total > 0 ? formatUsdQuota(record.subscription_amount_total) : t('不限')}</div>
                  <div>{t('重置')}：{formatSubscriptionResetPeriod(record, t)}</div>
                </div>
              }
            >
              <Tag color='blue' shape='circle'>
                {text || `#${record.subscription_plan_id}`}
              </Tag>
            </Popover>
          ) : (
            '-'
          ),
      },
      {
        title: t('订阅状态'),
        dataIndex: 'user_subscription_status',
        render: (text, record) =>
          record.subscription_plan_id ? (
            <Tag
              color={
                (text || 'pending') === 'active'
                  ? 'green'
                  : (text || 'pending') === 'cancelled'
                    ? 'red'
                    : (text || 'pending') === 'pending'
                      ? 'grey'
                    : 'orange'
              }
              shape='circle'
            >
              {text
                ? formatSubscriptionStatusLabel(text, t)
                : formatSubscriptionStatusLabel('pending', t)}
            </Tag>
          ) : (
            '-'
          ),
      },
      {
        title: t('下次重置'),
        dataIndex: 'subscription_next_reset_time',
        render: (text, record) =>
          record.subscription_plan_id
            ? record.user_subscription_id
              ? formatTime(text, t, '未设置')
              : t('待激活')
            : '-',
      },
      {
        title: t('创建时间'),
        dataIndex: 'created_time',
        render: (text) => formatTime(text, t),
      },
      {
        title: t('激活时间'),
        dataIndex: 'activated_time',
        render: (text) => formatTime(text, t),
      },
      {
        title: t('最近兑换'),
        dataIndex: 'last_redeem_time',
        render: (text) => formatTime(text, t),
      },
      {
        title: t('时长(天)'),
        dataIndex: 'duration_days',
        render: (text) => (text && text > 0 ? `${text}d` : '-'),
      },
      {
        title: t('实际到期'),
        dataIndex: 'expired_time',
        render: (text, record) => formatExpires(record, t),
      },
      {
        title: '',
        dataIndex: 'operate',
        fixed: 'right',
        width: 190,
        render: (text, record) => {
          const moreMenuItems = [
            {
              node: 'item',
              name: t('删除'),
              type: 'danger',
              onClick: () => {
                setDeletingRecord(record);
                setShowDelete(true);
              },
            },
          ];

          if (record.status === CLIENT_LICENSE_STATUS.ACTIVE && !isExpired(record)) {
            moreMenuItems.push({
              node: 'item',
              name: t('禁用'),
              type: 'warning',
              onClick: () => manageLicense(record, CLIENT_LICENSE_ACTIONS.DISABLE),
            });
          } else if (!isExpired(record)) {
            moreMenuItems.push({
              node: 'item',
              name: t('启用'),
              onClick: () => manageLicense(record, CLIENT_LICENSE_ACTIONS.ENABLE),
            });
          }

          return (
            <Space>
              <Button size='small' onClick={() => copyText(record.code)}>
                {t('复制')}
              </Button>
              <Button
                type='tertiary'
                size='small'
                onClick={() => {
                  setEditingLicense(record);
                  setShowEdit(true);
                }}
              >
                {t('编辑')}
              </Button>
              <Dropdown trigger='click' position='bottomRight' menu={moreMenuItems}>
                <Button type='tertiary' size='small' icon={<IconMore />} />
              </Dropdown>
            </Space>
          );
        },
      },
    ],
    [copyText, manageLicense, setDeletingRecord, setEditingLicense, setShowDelete, setShowEdit, t],
  );

  const tableColumns = useMemo(
    () =>
      compactMode
        ? columns.map((col) => {
            if (col.dataIndex === 'operate') {
              const { fixed, ...rest } = col;
              return rest;
            }
            return col;
          })
        : columns,
    [columns, compactMode],
  );

  return (
    <CardTable
      columns={tableColumns}
      dataSource={licenses}
      scroll={compactMode ? undefined : { x: 'max-content' }}
      pagination={{
        currentPage: activePage,
        pageSize,
        total,
        showSizeChanger: true,
        pageSizeOptions: [10, 20, 50, 100],
        onPageChange: handlePageChange,
        onPageSizeChange: handlePageSizeChange,
      }}
      hidePagination={true}
      loading={loading}
      rowSelection={rowSelection}
      onRow={handleRow}
      empty={
        <Empty
          image={<IllustrationNoResult style={{ width: 150, height: 150 }} />}
          darkModeImage={<IllustrationNoResultDark style={{ width: 150, height: 150 }} />}
          description={t('暂无客户端卡密')}
          style={{ padding: 30 }}
        />
      }
      className='rounded-xl overflow-hidden'
      size='middle'
    />
  );
};

const ClientLicensesPage = () => {
  const data = useClientLicensesData();
  const isMobile = useIsMobile();
  const activatedCount = useMemo(
    () => data.licenses.filter((item) => isActivated(item)).length,
    [data.licenses],
  );
  const enabledCount = useMemo(
    () =>
      data.licenses.filter(
        (item) => item.status === CLIENT_LICENSE_STATUS.ACTIVE && !isExpired(item),
      ).length,
    [data.licenses],
  );

  return (
    <>
      <EditClientLicenseModal
        editingLicense={data.editingLicense}
        visible={data.showEdit}
        onClose={data.closeEdit}
        refresh={data.refresh}
        t={data.t}
      />

      <DeleteClientLicenseModal
        visible={data.showDelete}
        onCancel={() => data.setShowDelete(false)}
        record={data.deletingRecord}
        manageLicense={data.manageLicense}
        refresh={data.refresh}
        licenses={data.licenses}
        activePage={data.activePage}
        t={data.t}
      />

      <CardPro
        type='type1'
        descriptionArea={
          <ClientLicensesDescription
            compactMode={data.compactMode}
            setCompactMode={data.setCompactMode}
            t={data.t}
            total={data.total}
            activatedCount={activatedCount}
            enabledCount={enabledCount}
          />
        }
        actionsArea={
          <div className='flex flex-col md:flex-row justify-between items-center gap-2 w-full'>
            <ClientLicensesActions
              setEditingLicense={data.setEditingLicense}
              setShowEdit={data.setShowEdit}
              batchCopyLicenses={data.batchCopyLicenses}
              batchExportLicenses={data.batchExportLicenses}
              t={data.t}
            />
            <div className='w-full md:w-full lg:w-auto order-1 md:order-2'>
              <ClientLicensesFilters
                formInitValues={data.formInitValues}
                setFormApi={data.setFormApi}
                searchLicenses={data.searchLicenses}
                loading={data.loading}
                searching={data.searching}
                t={data.t}
              />
            </div>
          </div>
        }
        paginationArea={createCardProPagination({
          currentPage: data.activePage,
          pageSize: data.pageSize,
          total: data.total,
          onPageChange: data.handlePageChange,
          onPageSizeChange: data.handlePageSizeChange,
          isMobile,
          t: data.t,
        })}
        t={data.t}
      >
        <ClientCompatSettingsCard t={data.t} />
        <ClientLicensesTable {...data} />
      </CardPro>
    </>
  );
};

export default ClientLicensesPage;
