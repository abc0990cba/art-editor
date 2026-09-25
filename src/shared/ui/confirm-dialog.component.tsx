import { Button } from './shadcn/button.tsx'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './shadcn/dialog.tsx'

/**
 * Confirmation modal for destructive actions (Photoshop/Figma pattern) on the shadcn dialog: dimmed
 * backdrop, title + explanation, muted cancel and a red confirm. Escape and the backdrop cancel;
 * the confirm action runs only from the explicit button. Renders above other modals (z-60).
 */
export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onClose,
}: {
  title: string
  message: string
  confirmLabel: string
  cancelLabel: string
  onConfirm: () => void
  onClose: () => void
}) {
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="z-60 max-w-sm gap-4 rounded-xl p-4 sm:max-w-sm"
      >
        <DialogHeader className="text-left">
          <DialogTitle className="text-body text-sm font-semibold tracking-wide">
            {title}
          </DialogTitle>
          <DialogDescription className="text-muted text-xs leading-relaxed">
            {message}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
            className="text-body border-line bg-chip hover:border-chip-line hover:bg-chip dark:border-line dark:bg-chip dark:text-body dark:hover:bg-chip h-auto px-3 py-1.5 text-xs font-normal"
          >
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={() => {
              onConfirm()
              onClose()
            }}
            className="h-auto px-3 py-1.5 text-xs"
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
