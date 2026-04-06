import React from 'react';
import { Badge, Button, Divider, Modal, Popover, Space, Tag, Tooltip, Typography } from '@douyinfe/semi-ui';
import { convertUSDToCurrency } from '../../../helpers/render';
import { renderQuota } from '../../../helpers';

const { Text } = Typography;

const formatDuration = (plan, t) => {
  if (!plan) return '-';
  const unit = plan.duration_unit || 'month';
  if (unit === 'custom') {
    const seconds = Number(plan.custom_seconds || 0);
    if (seconds >= 86400) return `${Math.floor(seconds / 86400)} ${t('天')}`;
    if (seconds >= 3600) return `${Math.floor(seconds / 3600)} ${t('小时')}`;
    if (seconds >= 60) return `${Math.floor(seconds / 60)} ${t('分钟')}`;
    return `${seconds} ${t('秒')}`;
  }
  const unitMap = {
    year: t('年'),
    month: t('个月'),
    day: t('天'),
    hour: t('小时'),
  };
  return `${Number(plan.duration_value || 0)}${unitMap[unit] || unit}`;
};

const formatResetPeriod = (plan, t) => {
  const period = plan?.quota_reset_period || 'never';
  if (period === 'daily') return t('每天');
  if (period === 'weekly') return t('每周');
  if (period === 'monthly') return t('每月');
  if (period === 'custom') {
    const seconds = Number(plan?.quota_reset_custom_seconds || 0);
    if (seconds >= 86400) return `${Math.floor(seconds / 86400)} ${t('天')}`;
    if (seconds >= 3600) return `${Math.floor(seconds / 3600)} ${t('小时')}`;
    if (seconds >= 60) return `${Math.floor(seconds / 60)} ${t('分钟')}`;
    return `${seconds} ${t('秒')}`;
  }
  return t('不重置');
};

const renderPlanTitle = (text, record, t) => {
  const plan = record?.plan;
  const subtitle = plan?.subtitle;
  return (
    <Popover
      position='rightTop'
      showArrow
      content={
        <div style={{ width: 280 }}>
          <Text strong>{text}</Text>
          {subtitle ? (
            <Text type='tertiary' style={{ display: 'block', marginTop: 4 }}>
              {subtitle}
            </Text>
          ) : null}
          <Divider margin={12} />
          <div style={{ display: 'grid', gridTemplateColumns: '88px 1fr', gap: 8 }}>
            <Text type='tertiary'>{t('价格')}</Text>
            <Text strong style={{ color: 'var(--semi-color-success)' }}>
              {convertUSDToCurrency(Number(plan?.price_amount || 0), 2)}
            </Text>
            <Text type='tertiary'>{t('总额度')}</Text>
            {Number(plan?.total_amount || 0) > 0 ? (
              <Tooltip content={`${t('原生额度')}：${plan.total_amount}`}>
                <span>{renderQuota(plan.total_amount)}</span>
              </Tooltip>
            ) : (
              <Text>{t('不限')}</Text>
            )}
            <Text type='tertiary'>{t('有效期')}</Text>
            <Text>{formatDuration(plan, t)}</Text>
            <Text type='tertiary'>{t('重置')}</Text>
            <Text>{formatResetPeriod(plan, t)}</Text>
            <Text type='tertiary'>{t('升级分组')}</Text>
            <Text>{plan?.upgrade_group || t('不升级')}</Text>
            <Text type='tertiary'>{t('购买上限')}</Text>
            <Text>{Number(plan?.max_purchase_per_user || 0) > 0 ? plan.max_purchase_per_user : t('不限')}</Text>
          </div>
        </div>
      }
    >
      <div style={{ cursor: 'pointer', maxWidth: 220 }}>
        <Text strong ellipsis={{ showTooltip: false }}>
          {text}
        </Text>
        {subtitle ? (
          <Text type='tertiary' ellipsis={{ showTooltip: false }} style={{ display: 'block' }}>
            {subtitle}
          </Text>
        ) : null}
      </div>
    </Popover>
  );
};

const renderPrice = (text) => (
  <Text strong style={{ color: 'var(--semi-color-success)' }}>
    {convertUSDToCurrency(Number(text || 0), 2)}
  </Text>
);

const renderEnabled = (enabled, t) =>
  enabled ? (
    <Tag color='white' shape='circle' type='light' prefixIcon={<Badge dot type='success' />}>
      {t('启用')}
    </Tag>
  ) : (
    <Tag color='white' shape='circle' type='light' prefixIcon={<Badge dot type='danger' />}>
      {t('禁用')}
    </Tag>
  );

const renderOperations = (record, { openEdit, setPlanEnabled, deletePlan, t }) => {
  const isEnabled = !!record?.plan?.enabled;
  return (
    <Space spacing={8}>
      <Button theme='light' type='tertiary' size='small' onClick={() => openEdit(record)}>
        {t('编辑')}
      </Button>
      {isEnabled ? (
        <Button
          theme='light'
          type='danger'
          size='small'
          onClick={() =>
            Modal.confirm({
              title: t('确认禁用'),
              content: t('禁用后用户端不再展示，但历史订单不受影响。是否继续？'),
              centered: true,
              onOk: () => setPlanEnabled(record, false),
            })
          }
        >
          {t('禁用')}
        </Button>
      ) : (
        <Button
          theme='light'
          type='primary'
          size='small'
          onClick={() =>
            Modal.confirm({
              title: t('确认启用'),
              content: t('启用后套餐将在用户端展示。是否继续？'),
              centered: true,
              onOk: () => setPlanEnabled(record, true),
            })
          }
        >
          {t('启用')}
        </Button>
      )}
      <Button
        theme='light'
        type='danger'
        size='small'
        onClick={() =>
          Modal.confirm({
            title: t('确认删除套餐'),
            content: t('删除后无法恢复；若该套餐已被订阅、客户端卡密或订单使用，系统会拒绝删除。是否继续？'),
            centered: true,
            onOk: () => deletePlan(record),
          })
        }
      >
        {t('删除')}
      </Button>
    </Space>
  );
};

export const getSubscriptionsColumns = ({ t, openEdit, setPlanEnabled, deletePlan, enableEpay }) => [
  {
    title: 'ID',
    dataIndex: ['plan', 'id'],
    width: 60,
    render: (text) => <Text type='tertiary'>#{text}</Text>,
  },
  {
    title: t('套餐'),
    dataIndex: ['plan', 'title'],
    width: 220,
    render: (text, record) => renderPlanTitle(text, record, t),
  },
  {
    title: t('价格'),
    dataIndex: ['plan', 'price_amount'],
    width: 100,
    render: (text) => renderPrice(text),
  },
  {
    title: t('购买上限'),
    width: 90,
    render: (_, record) => <Text type={Number(record?.plan?.max_purchase_per_user || 0) > 0 ? 'secondary' : 'tertiary'}>{Number(record?.plan?.max_purchase_per_user || 0) > 0 ? record.plan.max_purchase_per_user : t('不限')}</Text>,
  },
  {
    title: t('优先级'),
    dataIndex: ['plan', 'sort_order'],
    width: 80,
    render: (text) => <Text type='tertiary'>{Number(text || 0)}</Text>,
  },
  {
    title: t('有效期'),
    width: 110,
    render: (_, record) => <Text type='secondary'>{formatDuration(record?.plan, t)}</Text>,
  },
  {
    title: t('重置'),
    width: 100,
    render: (_, record) => <Text type='secondary'>{formatResetPeriod(record?.plan, t)}</Text>,
  },
  {
    title: t('状态'),
    dataIndex: ['plan', 'enabled'],
    width: 90,
    render: (text) => renderEnabled(text, t),
  },
  {
    title: t('支付渠道'),
    width: 180,
    render: (_, record) => (
      <Space spacing={4}>
        {record?.plan?.stripe_price_id ? (
          <Tag color='violet' shape='circle'>
            Stripe
          </Tag>
        ) : null}
        {record?.plan?.creem_product_id ? (
          <Tag color='cyan' shape='circle'>
            Creem
          </Tag>
        ) : null}
        {enableEpay ? (
          <Tag color='light-green' shape='circle'>
            {t('易支付')}
          </Tag>
        ) : null}
      </Space>
    ),
  },
  {
    title: t('总额度'),
    width: 100,
    render: (_, record) =>
      Number(record?.plan?.total_amount || 0) > 0 ? (
        <Tooltip content={`${t('原生额度')}：${record.plan.total_amount}`}>
          <span>{renderQuota(record.plan.total_amount)}</span>
        </Tooltip>
      ) : (
        <Text type='tertiary'>{t('不限')}</Text>
      ),
  },
  {
    title: t('升级分组'),
    width: 110,
    render: (_, record) => <Text type={record?.plan?.upgrade_group ? 'secondary' : 'tertiary'}>{record?.plan?.upgrade_group || t('不升级')}</Text>,
  },
  {
    title: t('操作'),
    dataIndex: 'operate',
    fixed: 'right',
    width: 220,
    render: (_, record) => renderOperations(record, { openEdit, setPlanEnabled, deletePlan, t }),
  },
];


