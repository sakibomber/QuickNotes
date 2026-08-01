/**
 * Full-screen bucket picker — where a swipe-right lands (spec §3).
 * Big colour-coded targets, three across, nothing else on the screen.
 */

import Sheet from './Sheet.jsx'
import BucketTile from './BucketTile.jsx'
import Button from './Button.jsx'

export default function BucketPickerSheet({ open, onClose, buckets, counts = {}, onPick, onTrash }) {
  return (
    <Sheet open={open} onClose={onClose} title="File it where?" full>
      <div className="grid grid-cols-3 gap-2.5 pt-1 pb-3">
        {buckets.map((bucket) => (
          <BucketTile
            key={bucket.id}
            bucket={bucket}
            size="lg"
            count={counts[bucket.id] || 0}
            onClick={() => onPick(bucket)}
          />
        ))}
      </div>
      {onTrash && (
        <div className="pb-2">
          <Button
            variant="quiet"
            full
            icon="trash"
            onClick={() => {
              onClose?.()
              onTrash()
            }}
            className="text-danger"
          >
            Throw it away
          </Button>
        </div>
      )}
    </Sheet>
  )
}
