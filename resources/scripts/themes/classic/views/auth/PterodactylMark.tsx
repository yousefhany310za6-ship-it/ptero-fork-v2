export default function PterodactylMark({ className }: { className?: string }) {
    return (
        <img
            src='/images/troxe-logo.png'
            alt='Troxe Hosting'
            role='img'
            aria-label='Troxe Hosting'
            className={className}
            style={{ width: '100%', maxWidth: '250px', height: 'auto', objectFit: 'contain', display: 'block', margin: '0 auto' }}
        />
    );
}
