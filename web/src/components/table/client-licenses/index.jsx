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

const CLIENT_LICENSE_VIEW_FILTERS = {
  ALL: 'all',
  EFFECTIVE: 'effective',
  EXPIRED: 'expired',
  DISABLED: 'disabled',
  ACTIVATED: 'activated',
  PENDING: 'pending',
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
    return { color: 'orange', text: t('宸茶繃鏈?) };
  }
  if (record?.status === CLIENT_LICENSE_STATUS.DISABLED) {
    return { color: 'red', text: t('宸茬鐢?) };
  }
  return { color: 'green', text: t('鐢熸晥涓?) };
};

const activationTag = (record, t) => {
  if (isActivated(record)) {
    return { color: 'blue', text: t('宸叉縺娲?) };
  }
  return { color: 'grey', text: t('鏈縺娲?) };
};

const maskText = (text) => {
  const value = (text || '').trim();
  if (!value) return '-';
  if (value.length <= 12) return value;
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
};

const formatTime = (value, t, emptyText = '鏈缃?) => {
  if (!value || value === 0) return t(emptyText);
  return timestamp2string(value);
};

const formatExpires = (record, t) => {
  const effectiveExpiredTime = getEffectiveExpiredTime(record);
  if (effectiveExpiredTime > 0) {
    return timestamp2string(effectiveExpiredTime);
  }
  if (record?.duration_days > 0) {
    return t('婵€娲诲悗 {{count}} 澶?, { count: record.duration_days });
  }
  return t('姘镐笉杩囨湡');
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
  if (unit === 'year' && value > 0) return `${value}${t('年')}`;
  if (unit === 'month' && value > 0) return `${value}${t('个月')}`;
  if (unit === 'day' && value > 0) return `${value}${t('天')}`;
  if (unit === 'hour' && value > 0) return `${value}${t('小时')}`;
  if (unit === 'custom' && customSeconds > 0) {
    if (customSeconds % 86400 === 0) return `${Math.floor(customSeconds / 86400)}${t('天')}`;
    if (customSeconds % 3600 === 0) return `${Math.floor(customSeconds / 3600)}${t('小时')}`;
    if (customSeconds % 60 === 0) return `${Math.floor(customSeconds / 60)}${t('分钟')}`;
    return `${customSeconds}${t('秒')}`;
  }
  return '-';
};

const formatSubscriptionTotalAmount = (quota, t) => {
  if (Number(quota || 0) <= 0) return t('不限');
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
  if (status === 'active') return t('生效中');
  if (status === 'cancelled') return t('已取消');
  if (status === 'expired') return t('已过期');
  if (status === 'pending') return t('待激活');
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
  const [viewFilter, setViewFilter] = useState(CLIENT_LICENSE_VIEW_FILTERS.ALL);

  const formInitValues = {
    searchKeyword: '',
  };

  const getSearchKeyword = () => {
    const values = formApi ? formApi.getValues() : {};
    return values.searchKeyword || '';
  };

  const buildViewQuery = (filter = viewFilter) =>
    filter && filter !== CLIENT_LICENSE_VIEW_FILTERS.ALL
      ? `&view=${encodeURIComponent(filter)}`
      : '';

  const loadLicenses = async (page = 1, size = pageSize, filter = viewFilter) => {
    setLoading(true);
    try {
      const res = await API.get(
        `/api/client_license/?p=${page}&page_size=${size}${buildViewQuery(filter)}`,
      );
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

  const searchLicenses = async (page = 1, size = pageSize, filter = viewFilter) => {
    const keyword = getSearchKeyword();
    if (!keyword) {
      await loadLicenses(page, size);
      return;
    }

    setSearching(true);
    try {
      const res = await API.get(
        `/api/client_license/search?keyword=${encodeURIComponent(keyword)}&p=${page}&page_size=${size}${buildViewQuery(filter)}`,
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

  const applyViewFilter = async (nextFilter) => {
    setViewFilter(nextFilter);
    setActivePage(1);
    if (getSearchKeyword()) {
      await searchLicenses(1, pageSize, nextFilter);
    } else {
      await loadLicenses(1, pageSize, nextFilter);
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
        showSuccess(t('鎿嶄綔鎴愬姛瀹屾垚锛?));
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
      showSuccess(t('宸插鍒跺埌鍓创鏉匡紒'));
    } else {
      Modal.error({
        title: t('鏃犳硶澶嶅埗鍒板壀璐存澘锛岃鎵嬪姩澶嶅埗'),
        content: text,
        size: 'large',
      });
    }
  };

  const batchCopyLicenses = async () => {
    if (selectedRows.length === 0) {
      showError(t('璇疯嚦灏戦€夋嫨涓€涓鎴风鍗″瘑锛?));
      return;
    }
    const text = selectedRows.map((item) => `${item.name || item.code}    ${item.code}`).join('\n');
    await copyText(text);
  };

  const batchManageLicenses = async (action) => {
    if (selectedRows.length === 0) {
      showError(t('璇疯嚦灏戦€夋嫨涓€涓鎴风鍗″瘑锛?));
      return;
    }
    setLoading(true);
    try {
      const results = await Promise.all(
        selectedRows.map(async (record) => {
          if (action === CLIENT_LICENSE_ACTIONS.DELETE) {
            return API.delete(`/api/client_license/${record.id}`);
          }
          const nextStatus =
            action === CLIENT_LICENSE_ACTIONS.DISABLE
              ? CLIENT_LICENSE_STATUS.DISABLED
              : CLIENT_LICENSE_STATUS.ACTIVE;
          return API.put('/api/client_license/', {
            ...record,
            status: nextStatus,
          });
        }),
      );
      const failed = results.find((item) => !item?.data?.success);
      if (failed) {
        throw new Error(failed?.data?.message || t('鎵归噺鎿嶄綔澶辫触'));
      }
      showSuccess(t('鎵归噺鎿嶄綔宸插畬鎴?));
      setSelectedRows([]);
      await refresh();
    } catch (error) {
      showError(error.message);
    } finally {
      setLoading(false);
    }
  };

  const batchExportLicenses = async () => {
    const exportRows = selectedRows.length > 0 ? selectedRows : licenses;
    if (exportRows.length === 0) {
      showError(t('褰撳墠娌℃湁鍙鍑虹殑鍗″瘑鏁版嵁'));
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
        ? t('宸插鍑烘墍閫夊崱瀵?)
        : t('宸插鍑哄綋鍓嶉〉鍗″瘑'),
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
    viewFilter,
    setViewFilter: applyViewFilter,
    compactMode,
    setCompactMode,
    manageLicense,
    batchManageLicenses,
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
        <Typography.Text>{t('瀹㈡埛绔崱瀵嗙鐞?)}</Typography.Text>
      </div>
      <div className='flex flex-wrap gap-2'>
        <Tag color='blue' shape='circle' size='small'>
          {t('鎬绘暟')} {total}
        </Tag>
        <Tag color='cyan' shape='circle' size='small'>
          {t('宸叉縺娲?)} {activatedCount}
        </Tag>
        <Tag color='green' shape='circle' size='small'>
          {t('鍙敤涓?)} {enabledCount}
        </Tag>
      </div>
    </div>
    <CompactModeToggle compactMode={compactMode} setCompactMode={setCompactMode} t={t} />
  </div>
);

const ClientLicensesViewFilters = ({
  viewFilter,
  setViewFilter,
  batchManageLicenses,
  selectedCount,
  t,
}) => {
  const filters = [
    { key: CLIENT_LICENSE_VIEW_FILTERS.ALL, label: t('鍏ㄩ儴') },
    { key: CLIENT_LICENSE_VIEW_FILTERS.EFFECTIVE, label: t('鐢熸晥涓?) },
    { key: CLIENT_LICENSE_VIEW_FILTERS.EXPIRED, label: t('宸茶繃鏈?) },
    { key: CLIENT_LICENSE_VIEW_FILTERS.DISABLED, label: t('宸茬鐢?) },
    { key: CLIENT_LICENSE_VIEW_FILTERS.ACTIVATED, label: t('宸叉縺娲?) },
    { key: CLIENT_LICENSE_VIEW_FILTERS.PENDING, label: t('鏈縺娲?) },
  ];

  return (
    <div className='flex flex-wrap gap-2 mb-4'>
      {filters.map((item) => (
        <Button
          key={item.key}
          type={viewFilter === item.key ? 'primary' : 'tertiary'}
          size='small'
          onClick={() => setViewFilter(item.key)}
        >
          {item.label}
        </Button>
      ))}
      <Button
        type='tertiary'
        className='flex-1 md:flex-initial'
        onClick={() => batchManageLicenses(CLIENT_LICENSE_ACTIONS.ENABLE)}
        disabled={selectedCount === 0}
        size='small'
      >
        {t('鎵归噺鍚敤')}
      </Button>
      <Button
        type='tertiary'
        className='flex-1 md:flex-initial'
        onClick={() => batchManageLicenses(CLIENT_LICENSE_ACTIONS.DISABLE)}
        disabled={selectedCount === 0}
        size='small'
      >
        {t('鎵归噺绂佺敤')}
      </Button>
      <Button
        type='tertiary'
        className='flex-1 md:flex-initial'
        onClick={() => batchManageLicenses(CLIENT_LICENSE_ACTIONS.DELETE)}
        disabled={selectedCount === 0}
        size='small'
      >
        {t('鎵归噺鍒犻櫎')}
      </Button>
    </div>
  );
};

export const ClientCompatSettingsCard = ({ t }) => {
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
        showError(message || t('鍔犺浇澶辫触锛岃閲嶈瘯'));
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
      showError(error.message || t('鍔犺浇澶辫触锛岃閲嶈瘯'));
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
      showError(t('浣犱技涔庡苟娌℃湁淇敼浠€涔?));
      return;
    }

    setSaving(true);
    try {
      const results = await Promise.all(
        updates.map((item) => API.put('/api/option/', item)),
      );
      const failed = results.find((item) => !item?.data?.success);
      if (failed) {
        throw new Error(failed?.data?.message || t('淇濆瓨澶辫触锛岃閲嶈瘯'));
      }
      showSuccess(t('瀹㈡埛绔繙绔厤缃凡淇濆瓨'));
      await loadSettings();
    } catch (error) {
      showError(error.message || t('淇濆瓨澶辫触锛岃閲嶈瘯'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className='!rounded-2xl shadow-sm border-0 mb-6'>
      <div className='flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4'>
        <div>
          <Typography.Text strong>{t('瀹㈡埛绔繙绔厤缃?)}</Typography.Text>
          <div className='text-xs text-gray-600 mt-1'>
            {t('鎺у埗 AI Deployer 瀹㈡埛绔惎鍔ㄦ椂鐨勫仠鐢ㄦ彁绀恒€佺増鏈鏌ャ€佹洿鏂板湴鍧€涓庨粯璁ゆā鍨?)}
          </div>
        </div>
        <Button theme='solid' onClick={saveSettings} loading={saving} icon={<IconSave />}>
          {t('淇濆瓨閰嶇疆')}
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
                label={t('鍚敤瀹㈡埛绔湇鍔?)}
                checkedText={t('寮€')}
                uncheckedText={t('鍏?)}
              />
            </Col>
            <Col span={12}>
              <Form.Input
                field='AIDeployerClientMinVersion'
                label={t('鏈€浣庣増鏈?)}
                placeholder='1.0.5'
                showClear
              />
            </Col>
            <Col span={12}>
              <Form.Input
                field='AIDeployerClientLatestVersion'
                label={t('鏈€鏂扮増鏈?)}
                placeholder='1.0.6'
                showClear
              />
            </Col>
            <Col span={24}>
              <Form.Input
                field='AIDeployerClientUpdateURL'
                label={t('鏇存柊鍦板潃')}
                placeholder='https://your-domain.example/downloads/ai-deployer'
                showClear
              />
            </Col>
            <Col span={24}>
              <Form.TextArea
                field='AIDeployerClientNotice'
                label={t('鎻愮ず鏂囨')}
                autosize={{ minRows: 3, maxRows: 6 }}
                placeholder={t('渚嬪锛氬綋鍓嶇増鏈繃鏃э紝璇峰崌绾у悗缁х画浣跨敤')}
                showClear
              />
            </Col>
            <Col span={24} md={12}>
              <Form.Input
                field='AIDeployerClientDefaultModel'
                label={t('榛樿 Codex 妯″瀷')}
                placeholder='gpt-5.3-codex'
                showClear
              />
            </Col>
            <Col span={24} md={12}>
              <Form.Input
                field='AIDeployerClientDefaultOCModel'
                label={t('榛樿 OpenCode 妯″瀷')}
                placeholder='openai/gpt-5.3-codex'
                showClear
              />
            </Col>
            <Col span={24}>
              <Form.Input
                field='AIDeployerClientDefaultSmallModel'
                label={t('榛樿灏忔ā鍨?)}
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
            placeholder={t('鍏抽敭瀛楋細ID / 鍗″瘑 / 鍚嶇О')}
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
            {t('鏌ヨ')}
          </Button>
          <Button
            type='tertiary'
            onClick={handleReset}
            className='flex-1 md:flex-initial md:w-auto'
            size='small'
          >
            {t('閲嶇疆')}
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
  batchManageLicenses,
  selectedCount,
  t,
}) => {
  const handleAdd = () => {
    setEditingLicense({ id: undefined });
    setShowEdit(true);
  };

  return (
    <div className='flex flex-wrap gap-2 w-full md:w-auto order-2 md:order-1'>
      <Button type='primary' className='flex-1 md:flex-initial' onClick={handleAdd} size='small'>
        {t('娣诲姞瀹㈡埛绔崱瀵?)}
      </Button>
      <Button
        type='tertiary'
        className='flex-1 md:flex-initial'
        onClick={batchCopyLicenses}
        size='small'
      >
        {t('鎵归噺澶嶅埗')}
      </Button>
      <Button
        type='tertiary'
        className='flex-1 md:flex-initial'
        onClick={batchExportLicenses}
        size='small'
        icon={<IconDownload />}
      >
        {t('鎵归噺瀵煎嚭')}
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
      title={t('纭畾鏄惁瑕佸垹闄ゆ瀹㈡埛绔崱瀵嗭紵')}
      visible={visible}
      onCancel={onCancel}
      onOk={handleConfirm}
      type='warning'
    >
      {t('姝や慨鏀瑰皢涓嶅彲閫嗐€?)}
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
      showSuccess(isEdit ? t('瀹㈡埛绔崱瀵嗘洿鏂版垚鍔燂紒') : t('瀹㈡埛绔崱瀵嗗垱寤烘垚鍔燂紒'));
      await refresh();
      onClose();

      if (!isEdit && generatedCodes.length > 0) {
        const text = generatedCodes.join('\n');
        Modal.confirm({
          title: t('瀹㈡埛绔崱瀵嗗垱寤烘垚鍔?),
          content: (
            <div>
              <p>{t('鏈鍏辩敓鎴?{{count}} 涓崱瀵嗐€?, { count: generatedCodes.length })}</p>
              <p>{t('鏄惁涓嬭浇鍗″瘑鍒楄〃鏂囦欢锛?)}</p>
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
            {isEdit ? t('鏇存柊') : t('鏂板缓')}
          </Tag>
          <Typography.Title heading={4} className='m-0'>
            {isEdit ? t('鏇存柊瀹㈡埛绔崱瀵?) : t('鍒涘缓鏂扮殑瀹㈡埛绔崱瀵?)}
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
              {t('鎻愪氦')}
            </Button>
            <Button theme='light' type='primary' onClick={onClose} icon={<IconClose />}>
              {t('鍙栨秷')}
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
                    <Typography.Text strong>{t('鍗″瘑淇℃伅')}</Typography.Text>
                    <div className='text-xs text-gray-600'>
                      {t('閰嶇疆鍗″瘑缂栫爜銆佹壒閲忕敓鎴愯鍒欎笌鍥哄畾杩囨湡鏃堕棿')}
                    </div>
                  </div>
                </div>
                <Row gutter={12}>
                  <Col span={24}>
                    <Form.Input
                      field='code'
                      label={t('鍗″瘑')}
                      placeholder={t('鐣欑┖鍒欒嚜鍔ㄧ敓鎴愶紱鎵归噺鍒涘缓鏃跺繀椤荤暀绌?)}
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
                          {t('鐢熸垚')}
                        </Button>
                      }
                    />
                  </Col>
                  <Col span={24}>
                    <Form.Input
                      field='name'
                      label={t('鍚嶇О')}
                      placeholder={t('渚嬪 starter / trial / annual')}
                      showClear
                    />
                  </Col>
                  <Col span={24}>
                    <Form.DatePicker
                      field='expired_time'
                      label={t('杩囨湡鏃堕棿')}
                      type='dateTime'
                      placeholder={t('鐣欑┖琛ㄧず姘镐笉杩囨湡锛涘璁剧疆鎸佺画澶╂暟璇风暀绌?)}
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
                          label={t('鐢熸垚鏁伴噺')}
                          min={1}
                          max={200}
                          style={{ width: '100%' }}
                        />
                      </Col>
                      <Col span={12}>
                        <Form.InputNumber
                          field='code_length'
                          label={t('闅忔満闀垮害')}
                          min={4}
                          max={32}
                          style={{ width: '100%' }}
                          extraText={t('浠呭鑷姩鐢熸垚鍗″瘑鐢熸晥')}
                        />
                      </Col>
                    </>
                  )}
                  <Col span={24}>
                    <Form.InputNumber
                      field='duration_days'
                      label={t('鎸佺画澶╂暟')}
                      min={0}
                      disabled={(Number(values.subscription_plan_id) || 0) > 0}
                      style={{ width: '100%' }}
                      extraText={(Number(values.subscription_plan_id) || 0) > 0
                        ? t('宸查€夋嫨璁㈤槄濂楅鏃讹紝杩欎釜鎸佺画澶╂暟瀛楁涓嶇敓鏁?)
                        : t('濉?0 琛ㄧず涓嶇敤鎸佺画澶╂暟锛涘ぇ浜?0 鏃朵粠棣栨婵€娲诲紑濮嬭鏃?)}
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
                    <Typography.Text strong>{t('棰濆害閰嶇疆')}</Typography.Text>
                    <div className='text-xs text-gray-600'>
                      {t('鎺у埗鍗″瘑婵€娲诲悗鐢熸垚鐨勪护鐗岄搴︿笌鏈夋晥绛栫暐')}
                    </div>
                  </div>
                </div>
                <Row gutter={12}>
                  <Col span={24}>
                    <Form.Select
                      field='subscription_plan_id'
                      label={t('璁㈤槄濂楅')}
                      placeholder={plansLoading ? t('鍔犺浇濂楅涓?..') : t('涓嶉€夊垯涓烘櫘閫氶搴﹀崱')}
                      style={{ width: '100%' }}
                      optionList={(subscriptionPlans || []).map((item) => ({
                        label: buildSubscriptionPlanOptionLabel(item, t),
                        value: item?.plan?.id,
                      }))}
                      showClear
                    />
                    {selectedSubscriptionPlan ? (
                      <div className='mt-2 text-xs text-gray-600 rounded-xl bg-gray-50 px-3 py-2 border border-gray-200'>
                        <div>{selectedSubscriptionPlan?.plan?.subtitle || t('鐠併垽妲勯崡鈥崇殺閹稿顒濇總妤咁樀瀵偓闁熬绱濇０婵嗗娑撳骸鍩岄張鐔告闂傜繝浜掓總妤咁樀娑撳搫鍣?)}</div>
                        <div className='mt-1'>
                          {t('娴犻攱鐗?)}锛?{Number(selectedSubscriptionPlan?.plan?.price_amount || 0).toFixed(2)} 路
                          {' '}{t('閺堝鏅ラ張?)}锛歿formatSubscriptionDuration(
                            {
                              subscription_duration_unit: selectedSubscriptionPlan?.plan?.duration_unit,
                              subscription_duration_value: selectedSubscriptionPlan?.plan?.duration_value,
                              subscription_custom_seconds: selectedSubscriptionPlan?.plan?.custom_seconds,
                            },
                            t,
                          )} 路
                          {' '}{t('閹顤傛惔?)}锛歿formatSubscriptionTotalAmount(selectedSubscriptionPlan?.plan?.total_amount, t)} 路
                          {' '}{t('闁插秶鐤?)}锛歿formatSubscriptionResetPeriod(
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
                      label={t('鏃犻檺棰濆害')}
                      checkedText={t('寮€')}
                      uncheckedText={t('鍏?)}
                      disabled={(Number(values.subscription_plan_id) || 0) > 0}
                    />
                  </Col>
                  <Col span={24}>
                    <Form.InputNumber
                      field='quota'
                      label={t('棰濆害锛圲SD锛?)}
                      min={0}
                      precision={2}
                      disabled={values.unlimited_quota || (Number(values.subscription_plan_id) || 0) > 0}
                      style={{ width: '100%' }}
                      extraText={(Number(values.subscription_plan_id) || 0) > 0
                        ? t('宸查€夋嫨璁㈤槄濂楅鏃讹紝杩欎釜棰濆害瀛楁涓嶇敓鏁?)
                        : `${t('鎸夌編鍏冨～鍐欙紝淇濆瓨鏃惰嚜鍔ㄦ崲绠椾负鍘熺敓棰濆害')} 路 ${t('鍘熺敓棰濆害')}锛?{usdAmountToQuota(
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
                    <Typography.Text strong>{t('璁惧缁戝畾')}</Typography.Text>
                    <div className='text-xs text-gray-600'>
                      {t('鍙€夛細鎵嬪姩缁存姢璁惧鍝堝笇锛岀敤浜庨攣瀹氭垨閲婃斁鎸囧畾璁惧')}
                    </div>
                  </div>
                </div>
                <Row gutter={12}>
                  <Col span={24}>
                    <Form.Input
                      field='device_hash'
                      label={t('璁惧鍝堝笇')}
                      placeholder={t('鐣欑┖琛ㄧず鏈粦瀹氳澶?)}
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
        title: t('鍗″瘑'),
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
        title: t('鍚嶇О'),
        dataIndex: 'name',
        render: (text, record) => text || record.code,
      },
      {
        title: t('婵€娲荤姸鎬?),
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
        title: t('鍗″瘑鐘舵€?),
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
        title: t('棰濆害锛圲SD锛?),
        dataIndex: 'quota',
        render: (text, record) =>
          record.unlimited_quota ? (
            <Tag color='green' shape='circle'>
              {t('鏃犻檺棰濆害')}
            </Tag>
          ) : (
            <Tag color='grey' shape='circle'>
              {formatUsdQuota(parseInt(text, 10) || 0)}
            </Tag>
          ),
      },
      {
        title: t('缁戝畾璁惧'),
        dataIndex: 'device_hash',
        render: (text) => (
          <Popover content={text || t('鏈粦瀹?)} position='top'>
            <span>{maskText(text)}</span>
          </Popover>
        ),
      },
      {
        title: t('鍏宠仈浠ょ墝'),
        dataIndex: 'token_id',
        render: (text) => text || '-',
      },
      {
        title: t('褰掑睘鐢ㄦ埛'),
        dataIndex: 'user_id',
        render: (text) => text || '-',
      },
      {
        title: t('璁㈤槄璁″垝'),
        dataIndex: 'subscription_plan_title',
        render: (text, record) =>
          record.subscription_plan_id ? (
            <Popover
              position='top'
              content={
                <div>
                  <div>{text || `#${record.subscription_plan_id}`}</div>
                  <div>{t('娴犻攱鐗?)}锛?{Number(record.subscription_price_amount || 0).toFixed(2)}</div>
                  <div>{t('閺堝鏅ラ張?)}锛歿formatSubscriptionDuration(record, t)}</div>
                  <div>{t('鎬婚搴?)}锛歿record.subscription_amount_total > 0 ? formatUsdQuota(record.subscription_amount_total) : t('涓嶉檺')}</div>
                  <div>{t('閲嶇疆')}锛歿formatSubscriptionResetPeriod(record, t)}</div>
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
        title: t('璁㈤槄鐘舵€?),
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
        title: t('涓嬫閲嶇疆'),
        dataIndex: 'subscription_next_reset_time',
        render: (text, record) =>
          record.subscription_plan_id
            ? record.user_subscription_id
              ? formatTime(text, t, '鏈缃?)
              : t('寰呮縺娲?)
            : '-',
      },
      {
        title: t('鍒涘缓鏃堕棿'),
        dataIndex: 'created_time',
        render: (text) => formatTime(text, t),
      },
      {
        title: t('婵€娲绘椂闂?),
        dataIndex: 'activated_time',
        render: (text) => formatTime(text, t),
      },
      {
        title: t('鏈€杩戝厬鎹?),
        dataIndex: 'last_redeem_time',
        render: (text) => formatTime(text, t),
      },
      {
        title: t('鏃堕暱(澶?'),
        dataIndex: 'duration_days',
        render: (text) => (text && text > 0 ? `${text}d` : '-'),
      },
      {
        title: t('瀹為檯鍒版湡'),
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
              name: t('鍒犻櫎'),
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
              name: t('绂佺敤'),
              type: 'warning',
              onClick: () => manageLicense(record, CLIENT_LICENSE_ACTIONS.DISABLE),
            });
          } else if (!isExpired(record)) {
            moreMenuItems.push({
              node: 'item',
              name: t('鍚敤'),
              onClick: () => manageLicense(record, CLIENT_LICENSE_ACTIONS.ENABLE),
            });
          }

          return (
            <Space>
              <Button size='small' onClick={() => copyText(record.code)}>
                {t('澶嶅埗')}
              </Button>
              <Button
                type='tertiary'
                size='small'
                onClick={() => {
                  setEditingLicense(record);
                  setShowEdit(true);
                }}
              >
                {t('缂栬緫')}
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
          description={t('鏆傛棤瀹㈡埛绔崱瀵?)}
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
              batchManageLicenses={data.batchManageLicenses}
              selectedCount={data.selectedRows.length}
              t={data.t}
            />
            <Button
              type='tertiary'
              size='small'
              onClick={() => {
                window.location.href = '/console/client-remote-config';
              }}
            >
              {data.t('瀹㈡埛绔繙绔厤缃?)}
            </Button>
            <div className='hidden'>
              <Button
                type='tertiary'
                size='small'
                disabled={data.selectedRows.length === 0}
                onClick={() => data.batchManageLicenses(CLIENT_LICENSE_ACTIONS.ENABLE)}
              >
                {data.t('鎵归噺鍚敤')}
              </Button>
              <Button
                type='tertiary'
                size='small'
                disabled={data.selectedRows.length === 0}
                onClick={() => data.batchManageLicenses(CLIENT_LICENSE_ACTIONS.DISABLE)}
              >
                {data.t('鎵归噺绂佺敤')}
              </Button>
              <Button
                type='tertiary'
                size='small'
                disabled={data.selectedRows.length === 0}
                onClick={() => data.batchManageLicenses(CLIENT_LICENSE_ACTIONS.DELETE)}
              >
                {data.t('鎵归噺鍒犻櫎')}
              </Button>
            </div>
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
        <ClientLicensesViewFilters
          viewFilter={data.viewFilter}
          setViewFilter={data.setViewFilter}
          batchManageLicenses={data.batchManageLicenses}
          selectedCount={data.selectedRows.length}
          t={data.t}
        />
        <ClientLicensesTable {...data} />
      </CardPro>
    </>
  );
};

export default ClientLicensesPage;
