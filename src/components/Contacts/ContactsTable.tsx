import { Table, Empty, message, Flex, Popconfirm, Button } from 'antd';
import { NoticeType } from 'antd/es/message/interface';
import { QuestionCircleOutlined } from '@ant-design/icons';
import { useEffect, useState } from 'react';
const { Column } = Table;
import './Contacts.css';
import { useTranslation } from 'react-i18next';
import { useAppSelector } from '../../hooks';

// name, ip, tier, status
function ContactsTable() {
  const { t } = useTranslation(['home', 'common']);
  const { activeChain } = useAppSelector((state) => state.sspState);
  const { contacts } = useAppSelector((state) => state.contacts);
  const [contactsByName, setContactsByName] = useState(contacts[activeChain]);

  const [messageApi, contextHolder] = message.useMessage();
  const displayMessage = (type: NoticeType, content: string) => {
    void messageApi.open({
      type,
      content,
    });
  };

  const editContact = (id: number) => {
    console.log('edit contact', id);
  };

  const deleteContact = (id: number) => {
    displayMessage('error', t('home:contacts.contact_deleted'));
    console.log('delete contact', id);
  };

  // on chain change and on load, sort contacts and set it
  useEffect(() => {
    console.log(contacts[activeChain]);
    const contactsCopy = [...contacts[activeChain]] ?? [];
    const sortedContacts = contactsCopy.sort((a, b) => {
      if (a.name > b.name) return 1;
      else if (a.name < b.name) return -1;
      else return 0;
    });
    setContactsByName(sortedContacts);
  }, [contacts, activeChain]);

  return (
    <>
      {contextHolder}
      <Table
        className="adjustedWidth"
        locale={{
          emptyText: (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={<span>{t('home:contacts.no_contacts')}</span>}
            />
          ),
        }}
        pagination={false}
        showHeader={false}
        rowKey="address"
        bordered={false}
        loading={false}
        dataSource={contactsByName}
        expandable={{
          showExpandColumn: false,
          expandedRowRender: (record) => (
            <div>
              <Flex gap="small">
                <Button
                  size="middle"
                  onClick={() => editContact(record.id)}
                >
                  {t('common:edit')}
                </Button>
                <Popconfirm
                  title={t('home:contacts.delete_contact')}
                  overlayStyle={{ maxWidth: 360, margin: 10 }}
                  okText={t('common:delete')}
                  cancelText={t('common:cancel')}
                  onConfirm={() => {
                    void deleteContact(record.id);
                  }}
                  icon={<QuestionCircleOutlined style={{ color: 'red' }} />}
                >
                  <Button size="middle">{t('common:delete')}</Button>
                </Popconfirm>
              </Flex>
            </div>
          ),
          expandRowByClick: true,
        }}
      >
        <Column
          title={t('common:name')}
          dataIndex="name"
          className="contact-name"
          render={(name: string) => <>{name || '---'}</>}
        />
        <Column
          title={t('common:address')}
          dataIndex="address"
          className="contact-address"
          render={(name: string) => <>{name || '---'}</>}
        />
      </Table>
    </>
  );
}

export default ContactsTable;
