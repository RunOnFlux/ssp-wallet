import { Button, Popconfirm, Tooltip } from 'antd';
import { toast } from '../../lib/toast';
import { NoticeType } from 'antd/es/message/interface';
import {
  BookUser as BookUserIcon,
  CircleHelp as CircleHelpIcon,
  Copy as CopyIcon,
  Pencil as PencilIcon,
  Trash2 as Trash2Icon,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import localForage from 'localforage';
import './Contacts.css';
import { useTranslation } from 'react-i18next';
import ManageContact from './ManageContact.tsx';
import Identicon from '../Identicon/Identicon';
import EmptyState from '../EmptyState/EmptyState';
import { useAppSelector, useAppDispatch } from '../../hooks';
import { contact } from '../../types';
import { setContacts } from '../../store';
import { truncateAddress } from '../../lib/addressDisplay';

function ContactsTable(props: { onAdd: () => void }) {
  const dispatch = useAppDispatch();
  const { t } = useTranslation(['home', 'common']);
  const { activeChain } = useAppSelector((state) => state.sspState);
  const { contacts } = useAppSelector((state) => state.contacts);
  const [contactsByName, setContactsByName] = useState(contacts[activeChain]);
  const [manageOpen, setManageOpen] = useState(false);
  const [manageContactId, setManageContactId] = useState<number>(-1);

  const displayMessage = (type: NoticeType, content: string) => {
    void toast.open({
      type,
      content,
    });
  };

  useEffect(() => {
    setManageOpen(manageContactId !== -1);
  }, [manageContactId]);

  const editContact = (id: number) => {
    setManageContactId(id);
  };

  const copyAddress = (address: string) => {
    navigator.clipboard
      .writeText(address)
      .then(() => {
        displayMessage('success', t('home:contacts.address_copied'));
      })
      .catch(() => {
        displayMessage('error', t('home:contacts.err_saving_contacts'));
      });
  };

  const deleteContact = (id: number) => {
    const adjustedChainContacts: contact[] = [];
    contacts[activeChain]?.forEach((contact: contact) => {
      if (contact.id !== id) {
        adjustedChainContacts.push(contact);
      }
    });

    const completeContacts = {
      ...contacts,
      [activeChain]: adjustedChainContacts,
    };

    // save
    dispatch(setContacts(completeContacts));
    void (async function () {
      try {
        await localForage.setItem('contacts', completeContacts);
      } catch (error) {
        console.log(error);
      }
    })();
    displayMessage('success', t('home:contacts.contact_deleted'));
  };

  // on chain change and on load, sort contacts and set it
  useEffect(() => {
    const contactsCopy = [...contacts[activeChain]];
    const sortedContacts = contactsCopy.sort((a, b) => {
      if (a.name > b.name) return 1;
      else if (a.name < b.name) return -1;
      else return 0;
    });
    setContactsByName(sortedContacts);
  }, [contacts, activeChain]);

  const manageContactAction = (status: boolean) => {
    setManageOpen(false);
    setManageContactId(-1);
    if (status === true) {
      displayMessage('success', t('home:contacts.contacts_updated'));
    }
  };

  const contactName = (record: contact) =>
    record.name ||
    new Date(record.id).toLocaleDateString() +
      ' ' +
      new Date(record.id).toLocaleTimeString();

  return (
    <>
      {contactsByName.length === 0 ? (
        <EmptyState
          icon={<BookUserIcon />}
          description={t('home:contacts.no_contacts')}
          action={
            <Button type="primary" size="small" onClick={props.onAdd}>
              {t('home:contacts.add_contact')}
            </Button>
          }
        />
      ) : (
        <div className="feed-list">
          {contactsByName.map((record) => (
            <div className="contact-row" key={record.id}>
              <Identicon value={record.address} size={28} />
              <div className="contact-row-main">
                <span className="contact-row-name">{contactName(record)}</span>
                <span className="contact-row-address" title={record.address}>
                  {truncateAddress(record.address) || '---'}
                </span>
              </div>
              <div className="contact-row-actions">
                <Tooltip title={t('home:contacts.copy_address')}>
                  <Button
                    type="text"
                    size="small"
                    className="contact-row-action"
                    icon={<CopyIcon size={14} />}
                    aria-label={`${t('home:contacts.copy_address')}: ${contactName(record)}`}
                    onClick={() => copyAddress(record.address)}
                  />
                </Tooltip>
                <Tooltip title={t('common:edit')}>
                  <Button
                    type="text"
                    size="small"
                    className="contact-row-action"
                    icon={<PencilIcon size={14} />}
                    aria-label={`${t('common:edit')}: ${contactName(record)}`}
                    onClick={() => editContact(record.id)}
                  />
                </Tooltip>
                <Popconfirm
                  title={t('home:contacts.delete_contact')}
                  overlayStyle={{ maxWidth: 360, margin: 10 }}
                  okText={t('common:delete')}
                  cancelText={t('common:cancel')}
                  onConfirm={() => {
                    void deleteContact(record.id);
                  }}
                  icon={<CircleHelpIcon style={{ color: '#f59e0b' }} />}
                >
                  <Button
                    type="text"
                    size="small"
                    danger
                    className="contact-row-action"
                    icon={<Trash2Icon size={14} />}
                    aria-label={`${t('common:delete')}: ${contactName(record)}`}
                  />
                </Popconfirm>
              </div>
            </div>
          ))}
        </div>
      )}
      {manageOpen && (
        <ManageContact
          openAction={manageContactAction}
          contactId={manageContactId}
        />
      )}
    </>
  );
}

export default ContactsTable;
