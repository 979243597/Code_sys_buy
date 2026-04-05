import React from 'react';
import { useTranslation } from 'react-i18next';
import { ClientCompatSettingsCard } from '../../components/table/client-licenses';

const ClientRemoteConfig = () => {
  const { t } = useTranslation();

  return (
    <div className='mt-[60px] px-2'>
      <ClientCompatSettingsCard t={t} />
    </div>
  );
};

export default ClientRemoteConfig;
