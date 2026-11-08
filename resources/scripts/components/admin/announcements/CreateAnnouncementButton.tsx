import { Dialog } from '@/components/elements/dialog';
import { NewButton } from '@/components/elements/NewButton';
import AnnouncementFormDialog from '@/components/admin/announcements/AnnouncementFormDialog';

export default function CreateAnnouncementButton() {
    return (
        <Dialog.Trigger trigger={({ onClick }) => <NewButton onClick={onClick}>New announcement</NewButton>}>
            {({ open, onClose }) => <AnnouncementFormDialog open={open} onClose={onClose} />}
        </Dialog.Trigger>
    );
}
