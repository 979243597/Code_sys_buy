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

import React, { useState, useEffect, useContext } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Card,
  Form,
  Button,
  Switch,
  Row,
  Col,
  Typography,
} from '@douyinfe/semi-ui';
import { API, showSuccess, showError } from '../../../helpers';
import { StatusContext } from '../../../context/Status';

const { Text } = Typography;

export default function SettingsSidebarModulesAdmin(props) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [statusState, statusDispatch] = useContext(StatusContext);

  // 宸︿晶杈规爮妯″潡绠＄悊鐘舵€侊紙绠＄悊鍛樺叏灞€鎺у埗锛?  const [sidebarModulesAdmin, setSidebarModulesAdmin] = useState({
    chat: {
      enabled: true,
      playground: true,
      chat: true,
    },
    console: {
      enabled: true,
      detail: true,
      token: true,
      log: true,
      midjourney: true,
      task: true,
    },
    personal: {
      enabled: true,
      topup: true,
      personal: true,
    },
    admin: {
      enabled: true,
      channel: true,
      models: true,
      deployment: true,
      redemption: true,
      client_license: true,
      client_remote_config: true,
      user: true,
      subscription: true,
      setting: true,
    },
  });

  // 澶勭悊鍖哄煙绾у埆寮€鍏冲彉鏇?  function handleSectionChange(sectionKey) {
    return (checked) => {
      const newModules = {
        ...sidebarModulesAdmin,
        [sectionKey]: {
          ...sidebarModulesAdmin[sectionKey],
          enabled: checked,
        },
      };
      setSidebarModulesAdmin(newModules);
    };
  }

  // 澶勭悊鍔熻兘绾у埆寮€鍏冲彉鏇?  function handleModuleChange(sectionKey, moduleKey) {
    return (checked) => {
      const newModules = {
        ...sidebarModulesAdmin,
        [sectionKey]: {
          ...sidebarModulesAdmin[sectionKey],
          [moduleKey]: checked,
        },
      };
      setSidebarModulesAdmin(newModules);
    };
  }

  // 重置为默认配置
  function resetSidebarModules() {
    const defaultModules = {
      chat: {
        enabled: true,
        playground: true,
        chat: true,
      },
      console: {
        enabled: true,
        detail: true,
        token: true,
        log: true,
        midjourney: true,
        task: true,
      },
      personal: {
        enabled: true,
        topup: true,
        personal: true,
      },
      admin: {
        enabled: true,
        channel: true,
        models: true,
        deployment: true,
        redemption: true,
        client_license: true,
        client_remote_config: true,
        user: true,
        subscription: true,
        setting: true,
      },
    };
    setSidebarModulesAdmin(defaultModules);
    showSuccess(t('宸查噸缃负榛樿閰嶇疆'));
  }

  // 淇濆瓨閰嶇疆
  async function onSubmit() {
    setLoading(true);
    try {
      const res = await API.put('/api/option/', {
        key: 'SidebarModulesAdmin',
        value: JSON.stringify(sidebarModulesAdmin),
      });
      const { success, message } = res.data;
      if (success) {
        showSuccess(t('淇濆瓨鎴愬姛'));

        // 立即更新 StatusContext 中的状态
        statusDispatch({
          type: 'set',
          payload: {
            ...statusState.status,
            SidebarModulesAdmin: JSON.stringify(sidebarModulesAdmin),
          },
        });

        // 鍒锋柊鐖剁粍浠剁姸鎬?        if (props.refresh) {
          await props.refresh();
        }
      } else {
        showError(message);
      }
    } catch (error) {
      showError(t('淇濆瓨澶辫触锛岃閲嶈瘯'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // 浠?props.options 涓幏鍙栭厤缃?    if (props.options && props.options.SidebarModulesAdmin) {
      try {
        const modules = JSON.parse(props.options.SidebarModulesAdmin);
        setSidebarModulesAdmin((prev) => ({
          ...prev,
          ...modules,
          chat: { ...prev.chat, ...(modules.chat || {}) },
          console: { ...prev.console, ...(modules.console || {}) },
          personal: { ...prev.personal, ...(modules.personal || {}) },
          admin: { ...prev.admin, ...(modules.admin || {}) },
        }));
      } catch (error) {
        // 浣跨敤榛樿閰嶇疆
        const defaultModules = {
          chat: { enabled: true, playground: true, chat: true },
          console: {
            enabled: true,
            detail: true,
            token: true,
            log: true,
            midjourney: true,
            task: true,
          },
          personal: { enabled: true, topup: true, personal: true },
          admin: {
            enabled: true,
            channel: true,
            models: true,
            deployment: true,
            redemption: true,
            client_license: true,
            client_remote_config: true,
            user: true,
            subscription: true,
            setting: true,
          },
        };
        setSidebarModulesAdmin(defaultModules);
      }
    }
  }, [props.options]);

  // 鍖哄煙閰嶇疆鏁版嵁
  const sectionConfigs = [
    {
      key: 'chat',
      title: t('鑱婂ぉ鍖哄煙'),
      description: t('鎿嶇粌鍦哄拰鑱婂ぉ鍔熻兘'),
      modules: [
        {
          key: 'playground',
          title: t('鎿嶇粌鍦?),
          description: t('AI妯″瀷娴嬭瘯鐜'),
        },
        { key: 'chat', title: t('鑱婂ぉ'), description: t('鑱婂ぉ浼氳瘽绠＄悊') },
      ],
    },
    {
      key: 'console',
      title: t('鎺у埗鍙板尯鍩?),
      description: t('鏁版嵁绠＄悊鍜屾棩蹇楁煡鐪?),
      modules: [
        { key: 'detail', title: t('鏁版嵁鐪嬫澘'), description: t('绯荤粺鏁版嵁缁熻') },
        { key: 'token', title: t('浠ょ墝绠＄悊'), description: t('API浠ょ墝绠＄悊') },
        { key: 'log', title: t('浣跨敤鏃ュ織'), description: t('API浣跨敤璁板綍') },
        {
          key: 'midjourney',
          title: t('缁樺浘鏃ュ織'),
          description: t('缁樺浘浠诲姟璁板綍'),
        },
        { key: 'task', title: t('浠诲姟鏃ュ織'), description: t('绯荤粺浠诲姟璁板綍') },
      ],
    },
    {
      key: 'personal',
      title: t('涓汉涓績鍖哄煙'),
      description: t('鐢ㄦ埛涓汉鍔熻兘'),
      modules: [
        { key: 'topup', title: t('閽卞寘绠＄悊'), description: t('浣欓鍏呭€肩鐞?) },
        {
          key: 'personal',
          title: t('涓汉璁剧疆'),
          description: t('涓汉淇℃伅璁剧疆'),
        },
      ],
    },
    {
      key: 'admin',
      title: t('绠＄悊鍛樺尯鍩?),
      description: t('绯荤粺绠＄悊鍔熻兘'),
      modules: [
        { key: 'channel', title: t('娓犻亾绠＄悊'), description: t('API娓犻亾閰嶇疆') },
        { key: 'models', title: t('妯″瀷绠＄悊'), description: t('AI妯″瀷閰嶇疆') },
        {
          key: 'deployment',
          title: t('妯″瀷閮ㄧ讲'),
          description: t('妯″瀷閮ㄧ讲绠＄悊'),
        },
        {
          key: 'subscription',
          title: t('订阅管理'),
          description: t('订阅套餐管理'),
        },
        {
          key: 'redemption',
          title: t('兑换码管理'),
          description: t('兑换码生成管理'),
        },
        {
          key: 'client_license',
          title: t('客户端卡密'),
          description: t('AI Deployer 客户端卡密管理'),
        },
        { key: 'user', title: t('用户管理'), description: t('用户账户管理') },
        {
          key: 'client_remote_config',
          title: t('客户端远端配置'),
          description: t('AI Deployer 客户端远端配置管理'),
        },
        {
          key: 'setting',
          title: t('系统设置'),
          description: t('系统参数配置'),
        },
      ],
    },
  ];

  return (
    <Card>
      <Form.Section
        text={t('渚ц竟鏍忕鐞嗭紙鍏ㄥ眬鎺у埗锛?)}
        extraText={t(
          '鍏ㄥ眬鎺у埗渚ц竟鏍忓尯鍩熷拰鍔熻兘鏄剧ず锛岀鐞嗗憳闅愯棌鐨勫姛鑳界敤鎴锋棤娉曞惎鐢?,
        )}
      >
        {sectionConfigs.map((section) => (
          <div key={section.key} style={{ marginBottom: '32px' }}>
            {/* 鍖哄煙鏍囬鍜屾€诲紑鍏?*/}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '16px',
                padding: '12px 16px',
                backgroundColor: 'var(--semi-color-fill-0)',
                borderRadius: '8px',
                border: '1px solid var(--semi-color-border)',
              }}
            >
              <div>
                <div
                  style={{
                    fontWeight: '600',
                    fontSize: '16px',
                    color: 'var(--semi-color-text-0)',
                    marginBottom: '4px',
                  }}
                >
                  {section.title}
                </div>
                <Text
                  type='secondary'
                  size='small'
                  style={{
                    fontSize: '12px',
                    color: 'var(--semi-color-text-2)',
                    lineHeight: '1.4',
                  }}
                >
                  {section.description}
                </Text>
              </div>
              <Switch
                checked={sidebarModulesAdmin[section.key]?.enabled}
                onChange={handleSectionChange(section.key)}
                size='default'
              />
            </div>

            {/* 鍔熻兘妯″潡缃戞牸 */}
            <Row gutter={[16, 16]}>
              {section.modules.map((module) => (
                <Col key={module.key} xs={24} sm={12} md={8} lg={6} xl={6}>
                  <Card
                    bodyStyle={{ padding: '16px' }}
                    hoverable
                    style={{
                      opacity: sidebarModulesAdmin[section.key]?.enabled
                        ? 1
                        : 0.5,
                      transition: 'opacity 0.2s',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        height: '100%',
                      }}
                    >
                      <div style={{ flex: 1, textAlign: 'left' }}>
                        <div
                          style={{
                            fontWeight: '600',
                            fontSize: '14px',
                            color: 'var(--semi-color-text-0)',
                            marginBottom: '4px',
                          }}
                        >
                          {module.title}
                        </div>
                        <Text
                          type='secondary'
                          size='small'
                          style={{
                            fontSize: '12px',
                            color: 'var(--semi-color-text-2)',
                            lineHeight: '1.4',
                            display: 'block',
                          }}
                        >
                          {module.description}
                        </Text>
                      </div>
                      <div style={{ marginLeft: '16px' }}>
                        <Switch
                          checked={
                            sidebarModulesAdmin[section.key]?.[module.key]
                          }
                          onChange={handleModuleChange(section.key, module.key)}
                          size='default'
                          disabled={!sidebarModulesAdmin[section.key]?.enabled}
                        />
                      </div>
                    </div>
                  </Card>
                </Col>
              ))}
            </Row>
          </div>
        ))}

        <div
          style={{
            display: 'flex',
            gap: '12px',
            justifyContent: 'flex-start',
            alignItems: 'center',
            paddingTop: '8px',
            borderTop: '1px solid var(--semi-color-border)',
          }}
        >
          <Button
            size='default'
            type='tertiary'
            onClick={resetSidebarModules}
            style={{
              borderRadius: '6px',
              fontWeight: '500',
            }}
          >
            {t('重置为默认')}
          </Button>
          <Button
            size='default'
            type='primary'
            onClick={onSubmit}
            loading={loading}
            style={{
              borderRadius: '6px',
              fontWeight: '500',
              minWidth: '100px',
            }}
          >
            {t('淇濆瓨璁剧疆')}
          </Button>
        </div>
      </Form.Section>
    </Card>
  );
}


