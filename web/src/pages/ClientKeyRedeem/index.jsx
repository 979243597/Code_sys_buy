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

import React, { useContext, useMemo, useState } from 'react';
import { Button, Card, Input, Space, Tag, Typography } from '@douyinfe/semi-ui';
import { IconCopy, IconKey, IconLink, IconRefresh } from '@douyinfe/semi-icons';
import { useTranslation } from 'react-i18next';
import { API, copy, showError, showSuccess } from '../../helpers';
import { StatusContext } from '../../context/Status';

const formatTime = (value, emptyText = '-') => {
  if (!value) return emptyText;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
};

const formatUnixSeconds = (value, emptyText = '-') => {
  const numeric = Number(value || 0);
  if (!numeric) return emptyText;
  return new Date(numeric * 1000).toLocaleString();
};

const formatResetRule = (period, customSeconds, t) => {
  if (!period || period === 'never') return t('不重置');
  if (period === 'daily') return t('每天');
  if (period === 'weekly') return t('每周');
  if (period === 'monthly') return t('每月');
  if (period === 'custom') {
    const seconds = Number(customSeconds || 0);
    if (seconds <= 0) return t('自定义');
    if (seconds % 86400 === 0) return `${seconds / 86400}${t('天')}`;
    if (seconds % 3600 === 0) return `${seconds / 3600}${t('小时')}`;
    if (seconds % 60 === 0) return `${seconds / 60}${t('分钟')}`;
    return `${seconds}${t('秒')}`;
  }
  return period;
};

const formatDuration = (unit, value, customSeconds, t) => {
  const numericValue = Number(value || 0);
  const numericCustom = Number(customSeconds || 0);
  if (unit === 'year' && numericValue > 0) return `${numericValue}${t('年')}`;
  if (unit === 'month' && numericValue > 0) return `${numericValue}${t('个月')}`;
  if (unit === 'day' && numericValue > 0) return `${numericValue}${t('天')}`;
  if (unit === 'hour' && numericValue > 0) return `${numericValue}${t('小时')}`;
  if (unit === 'custom' && numericCustom > 0) {
    if (numericCustom % 86400 === 0) return `${numericCustom / 86400}${t('天')}`;
    if (numericCustom % 3600 === 0) return `${numericCustom / 3600}${t('小时')}`;
    if (numericCustom % 60 === 0) return `${numericCustom / 60}${t('分钟')}`;
    return `${numericCustom}${t('秒')}`;
  }
  return '-';
};

const formatUsd = (value, digits = 4) => {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric) || numeric <= 0) return '$0.0000';
  return `$${numeric.toFixed(digits)}`;
};

const buildResultFromRedeem = (payload, endpoint) => ({
  endpoint,
  key: payload.key || '',
  expiresAt: payload.expires_at || '',
  quotaMode: payload.quota_mode || 'quota',
  subscriptionPlanTitle: payload.subscription_plan_title || '',
  subscriptionStatus: payload.subscription_status || '',
  subscriptionNextResetTime: payload.subscription_next_reset_time || 0,
  subscriptionPriceAmount: payload.subscription_price_amount || 0,
  subscriptionDurationUnit: payload.subscription_duration_unit || '',
  subscriptionDurationValue: payload.subscription_duration_value || 0,
  subscriptionCustomSeconds: payload.subscription_custom_seconds || 0,
  subscriptionResetPeriod: payload.subscription_reset_period || '',
  subscriptionResetCustomSeconds:
    payload.subscription_reset_custom_seconds || 0,
});

const mergeUsageIntoResult = (payload, previous, endpoint) => ({
  ...(previous || {}),
  endpoint: previous?.endpoint || endpoint,
  key: previous?.key || '',
  expiresAt: payload.expires_at || previous?.expiresAt || '',
  status: payload.status || '',
  unlimited: Boolean(payload.unlimited),
  usedAmount: Number(payload.used_amount || 0),
  remainAmount: Number(payload.remain_amount || 0),
  quotaMode: payload.quota_mode || previous?.quotaMode || 'quota',
  subscriptionPlanTitle:
    payload.subscription_plan_title || previous?.subscriptionPlanTitle || '',
  subscriptionStatus:
    payload.subscription_status || previous?.subscriptionStatus || '',
  subscriptionNextResetTime:
    payload.subscription_next_reset_time ||
    previous?.subscriptionNextResetTime ||
    0,
  subscriptionPriceAmount:
    payload.subscription_price_amount || previous?.subscriptionPriceAmount || 0,
  subscriptionDurationUnit:
    payload.subscription_duration_unit || previous?.subscriptionDurationUnit || '',
  subscriptionDurationValue:
    payload.subscription_duration_value ||
    previous?.subscriptionDurationValue ||
    0,
  subscriptionCustomSeconds:
    payload.subscription_custom_seconds ||
    previous?.subscriptionCustomSeconds ||
    0,
  subscriptionResetPeriod:
    payload.subscription_reset_period || previous?.subscriptionResetPeriod || '',
  subscriptionResetCustomSeconds:
    payload.subscription_reset_custom_seconds ||
    previous?.subscriptionResetCustomSeconds ||
    0,
  subscriptionTotalAmount: Number(payload.subscription_total_amount || 0),
  subscriptionUsedAmount: Number(payload.subscription_used_amount || 0),
});

const ClientKeyRedeemPage = () => {
  const { t } = useTranslation();
  const [statusState] = useContext(StatusContext);
  const [code, setCode] = useState('');
  const [action, setAction] = useState('');
  const [result, setResult] = useState(null);

  const serverAddress =
    statusState?.status?.server_address || `${window.location.origin}`;
  const endpoint = useMemo(
    () => `${serverAddress.replace(/\/+$/, '')}/v1`,
    [serverAddress],
  );

  const handleCopy = async (text, label) => {
    const ok = await copy(text);
    if (ok) {
      showSuccess(t('{{label}} 已复制到剪贴板', { label }));
    } else {
      showError(t('复制失败，请手动复制'));
    }
  };

  const requestPayload = (normalizedCode) => ({
    code: normalizedCode,
  });

  const handleRedeem = async () => {
    const normalizedCode = code.trim();
    if (!normalizedCode) {
      showError(t('请输入客户端卡密'));
      return;
    }
    setAction('redeem');
    try {
      const res = await API.post('/api/redeem', requestPayload(normalizedCode));
      const payload = res.data || {};
      if (!payload.success) {
        showError(payload.message || t('兑换失败'));
        return;
      }
      setResult(buildResultFromRedeem(payload, endpoint));
      showSuccess(t('兑换成功'));
    } catch (error) {
      showError(error?.message || t('兑换失败'));
    } finally {
      setAction('');
    }
  };

  const handleQueryUsage = async () => {
    const normalizedCode = code.trim();
    if (!normalizedCode) {
      showError(t('请输入客户端卡密'));
      return;
    }
    setAction('usage');
    try {
      const res = await API.post('/api/usage', requestPayload(normalizedCode));
      const payload = res.data || {};
      if (!payload.success) {
        showError(payload.message || t('查询失败'));
        return;
      }
      setResult((previous) => mergeUsageIntoResult(payload, previous, endpoint));
      showSuccess(t('查询成功'));
    } catch (error) {
      showError(error?.message || t('查询失败'));
    } finally {
      setAction('');
    }
  };

  return (
    <div className='min-h-screen w-full bg-gradient-to-b from-[#120f24] via-[#171231] to-[#22155a] px-4 py-16'>
      <div className='mx-auto w-full max-w-3xl'>
        <Card className='!rounded-3xl !border-0 shadow-2xl'>
          <div className='flex flex-col gap-8'>
            <div className='flex flex-col gap-3'>
              <Typography.Title heading={2} className='!mb-0'>
                {t('兑换 URL 与 Key')}
              </Typography.Title>
              <Typography.Text type='tertiary'>
                {t('输入客户端卡密后，直接兑换 OpenAI 兼容地址和可用 Key，也可以单独查询当前已用和剩余额度。')}
              </Typography.Text>
            </div>

            <Card className='!rounded-2xl !border-0 bg-[var(--semi-color-fill-0)]'>
              <div className='flex flex-col gap-4'>
                <div className='flex items-center gap-2'>
                  <IconKey />
                  <Typography.Text strong>{t('客户端卡密')}</Typography.Text>
                </div>
                <Input
                  size='large'
                  value={code}
                  onChange={setCode}
                  placeholder={t('请输入卡密（CDX-XXXX-XXXX）')}
                  showClear
                />
                <Space wrap>
                  <Button
                    theme='solid'
                    type='primary'
                    size='large'
                    loading={action === 'redeem'}
                    onClick={handleRedeem}
                  >
                    {t('立即兑换')}
                  </Button>
                  <Button
                    size='large'
                    icon={<IconRefresh />}
                    loading={action === 'usage'}
                    onClick={handleQueryUsage}
                  >
                    {t('查询额度')}
                  </Button>
                </Space>
              </div>
            </Card>

            <Card className='!rounded-2xl !border-0 bg-[var(--semi-color-fill-0)]'>
              <div className='flex flex-col gap-4'>
                <Typography.Text strong>{t('兑换结果')}</Typography.Text>

                <div className='flex flex-col gap-2'>
                  <Typography.Text type='tertiary'>{t('URL')}</Typography.Text>
                  <Space align='center' className='w-full' wrap={false}>
                    <Input
                      value={result?.endpoint || endpoint}
                      readOnly
                      size='large'
                      prefix={<IconLink />}
                    />
                    <Button
                      size='large'
                      icon={<IconCopy />}
                      onClick={() => handleCopy(result?.endpoint || endpoint, 'URL')}
                    >
                      {t('复制')}
                    </Button>
                  </Space>
                </div>

                <div className='flex flex-col gap-2'>
                  <Typography.Text type='tertiary'>{t('Key')}</Typography.Text>
                  <Space align='center' className='w-full' wrap={false}>
                    <Input
                      value={result?.key || ''}
                      readOnly
                      size='large'
                      placeholder={t('兑换成功后将在这里显示 Key')}
                    />
                    <Button
                      size='large'
                      icon={<IconCopy />}
                      disabled={!result?.key}
                      onClick={() => handleCopy(result?.key || '', 'Key')}
                    >
                      {t('复制')}
                    </Button>
                  </Space>
                </div>

                {result ? (
                  <div className='flex flex-col gap-3 rounded-2xl border border-[var(--semi-color-border)] bg-white/60 px-4 py-4'>
                    <Space wrap>
                      <Tag color='blue'>
                        {result.quotaMode === 'subscription'
                          ? t('订阅卡')
                          : t('普通额度卡')}
                      </Tag>
                      {result.status ? (
                        <Tag color='grey'>{t('状态')}：{result.status}</Tag>
                      ) : null}
                      <Tag color='green'>
                        {t('到期时间')}：{formatTime(result.expiresAt, t('未设置'))}
                      </Tag>
                      {typeof result.unlimited === 'boolean' ? (
                        <Tag color={result.unlimited ? 'green' : 'orange'}>
                          {result.unlimited ? t('无限额度') : t('按额度计费')}
                        </Tag>
                      ) : null}
                    </Space>

                    {typeof result.usedAmount === 'number' ||
                    typeof result.remainAmount === 'number' ? (
                      <div className='grid grid-cols-1 gap-3 md:grid-cols-2'>
                        <div className='rounded-xl bg-white/70 px-4 py-3'>
                          <Typography.Text type='tertiary'>
                            {t('已用额度')}
                          </Typography.Text>
                          <Typography.Title heading={5} className='!mb-0'>
                            {formatUsd(result.usedAmount)}
                          </Typography.Title>
                        </div>
                        <div className='rounded-xl bg-white/70 px-4 py-3'>
                          <Typography.Text type='tertiary'>
                            {t('剩余额度')}
                          </Typography.Text>
                          <Typography.Title heading={5} className='!mb-0'>
                            {result.unlimited ? t('无限额度') : formatUsd(result.remainAmount)}
                          </Typography.Title>
                        </div>
                      </div>
                    ) : null}

                    {result.quotaMode === 'subscription' ? (
                      <div className='text-sm text-[var(--semi-color-text-1)] leading-7'>
                        <div>
                          {t('订阅计划')}：
                          {result.subscriptionPlanTitle || t('未命名套餐')}
                        </div>
                        <div>
                          {t('订阅状态')}：
                          {result.subscriptionStatus || t('待激活')}
                        </div>
                        <div>
                          {t('价格')}：$
                          {Number(result.subscriptionPriceAmount || 0).toFixed(2)}
                        </div>
                        <div>
                          {t('有效期')}：
                          {formatDuration(
                            result.subscriptionDurationUnit,
                            result.subscriptionDurationValue,
                            result.subscriptionCustomSeconds,
                            t,
                          )}
                        </div>
                        <div>
                          {t('重置规则')}：
                          {formatResetRule(
                            result.subscriptionResetPeriod,
                            result.subscriptionResetCustomSeconds,
                            t,
                          )}
                        </div>
                        <div>
                          {t('套餐总额度')}：
                          {result.subscriptionTotalAmount > 0
                            ? formatUsd(result.subscriptionTotalAmount)
                            : t('不限')}
                        </div>
                        <div>
                          {t('套餐已用额度')}：
                          {formatUsd(result.subscriptionUsedAmount)}
                        </div>
                        <div>
                          {t('下次重置')}：
                          {formatUnixSeconds(
                            result.subscriptionNextResetTime,
                            t('未设置'),
                          )}
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </Card>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default ClientKeyRedeemPage;
