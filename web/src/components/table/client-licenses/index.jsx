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
  renderQuota,
  renderQuotaWithPrompt,
  showError,
  showSuccess,
  timestamp2string,
} from '../../../helpers';
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

const generateClientLicenseCode = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const buildPart = () =>
    Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  return `CDX-${buildPart()}-${buildPart()}`;
};

const currentUnix = () => Math.floor(Date.now() / 1000);

const isExpired = (record) =>
  record?.status === CLIENT_LICENSE_STATUS.ACTIVE &&
  record?.expired_time > 0 &&
  record.expired_time < currentUnix();

const statusTag = (record, t) => {
  if (isExpired(record)) {
    return { color: 'orange', text: t('已过期') };
  }
  if (record?.status === CLIENT_LICENSE_STATUS.DISABLED) {
    return { color: 'red', text: t('已禁用') };
  }
  return { color: 'green', text: t('生效中') };
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
    handlePageChange,
    handlePageSizeChange,
    rowSelection,
    handleRow,
    closeEdit,
  };
};

const ClientLicensesDescription = ({ compactMode, setCompactMode, t }) => (
  <div className='flex flex-col md:flex-row justify-between items-start md:items-center gap-2 w-full'>
    <div className='flex items-center text-violet-500'>
      <KeyRound size={16} className='mr-2' />
      <Typography.Text>{t('客户端卡密管理')}</Typography.Text>
    </div>
    <CompactModeToggle compactMode={compactMode} setCompactMode={setCompactMode} t={t} />
  </div>
);

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
        {t('复制所选卡密')}
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
  const formApiRef = useRef(null);

  const getInitValues = () => ({
    code: generateClientLicenseCode(),
    name: '',
    unlimited_quota: true,
    quota: 0,
    device_hash: '',
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
        expired_time: data.expired_time === 0 ? null : new Date(data.expired_time * 1000),
      });
    } else {
      showError(message);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (!formApiRef.current) return;
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
      name: (values.name || values.code || '').trim(),
      quota: parseInt(values.quota, 10) || 0,
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
      showSuccess(isEdit ? t('客户端卡密更新成功！') : t('客户端卡密创建成功！'));
      await refresh();
      onClose();
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
          {({ values }) => (
            <div className='p-2'>
              <div className='mb-6 rounded-2xl border border-[var(--semi-color-border)] bg-[var(--semi-color-bg-1)] p-4'>
                <div className='mb-3 flex items-center'>
                  <Avatar size='small' color='blue' className='mr-2 shadow-md'>
                    <IconKey size='small' />
                  </Avatar>
                  <div>
                    <Typography.Text strong>{t('卡密信息')}</Typography.Text>
                    <div className='text-xs text-gray-600'>
                      {t('设置 AI Deployer 客户端可兑换的卡密')}
                    </div>
                  </div>
                </div>
                <Row gutter={12}>
                  <Col span={24}>
                    <Form.Input
                      field='code'
                      label={t('卡密')}
                      placeholder='CDX-XXXX-XXXX'
                      rules={[{ required: true, message: t('请输入卡密') }]}
                      showClear
                      extraText={
                        <Button
                          type='tertiary'
                          size='small'
                          onClick={() => formApiRef.current?.setValue('code', generateClientLicenseCode())}
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
                      placeholder={t('留空表示永不过期')}
                      style={{ width: '100%' }}
                      showClear
                    />
                  </Col>
                </Row>
              </div>

              <div className='mb-6 rounded-2xl border border-[var(--semi-color-border)] bg-[var(--semi-color-bg-1)] p-4'>
                <div className='mb-3 flex items-center'>
                  <Avatar size='small' color='green' className='mr-2 shadow-md'>
                    <IconKey size='small' />
                  </Avatar>
                  <div>
                    <Typography.Text strong>{t('额度配置')}</Typography.Text>
                    <div className='text-xs text-gray-600'>
                      {t('控制兑换后创建的 new-api token 可用额度')}
                    </div>
                  </div>
                </div>
                <Row gutter={12}>
                  <Col span={24}>
                    <Form.Switch
                      field='unlimited_quota'
                      label={t('无限额度')}
                      checkedText={t('开')}
                      uncheckedText={t('关')}
                    />
                  </Col>
                  <Col span={24}>
                    <Form.InputNumber
                      field='quota'
                      label={t('额度')}
                      min={0}
                      disabled={values.unlimited_quota}
                      style={{ width: '100%' }}
                      extraText={renderQuotaWithPrompt(Number(values.quota) || 0)}
                    />
                  </Col>
                </Row>
              </div>

              <div className='rounded-2xl border border-[var(--semi-color-border)] bg-[var(--semi-color-bg-1)] p-4'>
                <div className='mb-3 flex items-center'>
                  <Avatar size='small' color='grey' className='mr-2 shadow-md'>
                    <IconKey size='small' />
                  </Avatar>
                  <div>
                    <Typography.Text strong>{t('设备绑定')}</Typography.Text>
                    <div className='text-xs text-gray-600'>
                      {t('可选：手动写入或清空设备哈希，用于重绑设备')}
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
              </div>
            </div>
          )}
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
        title: t('状态'),
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
        title: t('额度'),
        dataIndex: 'quota',
        render: (text, record) =>
          record.unlimited_quota ? (
            <Tag color='green' shape='circle'>
              {t('无限额度')}
            </Tag>
          ) : (
            <Tag color='grey' shape='circle'>
              {renderQuota(parseInt(text, 10) || 0)}
            </Tag>
          ),
      },
      {
        title: t('设备绑定'),
        dataIndex: 'device_hash',
        render: (text) => (
          <Popover content={text || t('未绑定')} position='top'>
            <span>{maskText(text)}</span>
          </Popover>
        ),
      },
      {
        title: t('Token ID'),
        dataIndex: 'token_id',
        render: (text) => text || '-',
      },
      {
        title: t('用户 ID'),
        dataIndex: 'user_id',
        render: (text) => text || '-',
      },
      {
        title: t('创建时间'),
        dataIndex: 'created_time',
        render: (text) => formatTime(text, t),
      },
      {
        title: t('最近兑换'),
        dataIndex: 'last_redeem_time',
        render: (text) => formatTime(text, t),
      },
      {
        title: t('过期时间'),
        dataIndex: 'expired_time',
        render: (text) => formatTime(text, t, '永不过期'),
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
          />
        }
        actionsArea={
          <div className='flex flex-col md:flex-row justify-between items-center gap-2 w-full'>
            <ClientLicensesActions
              setEditingLicense={data.setEditingLicense}
              setShowEdit={data.setShowEdit}
              batchCopyLicenses={data.batchCopyLicenses}
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
        <ClientLicensesTable {...data} />
      </CardPro>
    </>
  );
};

export default ClientLicensesPage;
