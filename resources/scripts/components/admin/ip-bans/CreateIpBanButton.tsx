import { Dialog } from '@/components/elements/dialog';
import { NewButton } from '@/components/elements/NewButton';
import CreateIpBanDialog from '@/components/admin/ip-bans/CreateIpBanDialog';

export default function CreateIpBanButton() {
    return (
        <Dialog.Trigger trigger={({ onClick }) => <NewButton onClick={onClick}>Ban an address</NewButton>}>
            {({ open, onClose }) => <CreateIpBanDialog open={open} onClose={onClose} />}
        </Dialog.Trigger>
    );
}
