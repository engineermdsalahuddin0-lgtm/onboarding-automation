import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../lib/store';
import type { CvBucket } from '../types';
import { Button, Dialog, errorText, TextInput, useToast } from './ui';

/**
 * Deletes a CV bucket. An empty one goes at once. One with CVs takes every CV, its history and its files with
 * it, so the designation has to be typed first, and only an admin can do it.
 */
export function DeleteBucketDialog({ bucket, onClose }: { bucket: CvBucket; onClose: () => void }) {
  const { candidates, removeBucket, isAdmin } = useStore();
  const toast = useToast();
  const navigate = useNavigate();
  const count = candidates.filter((c) => c.bucket_id === bucket.id).length;
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const matches = typed.trim().toLowerCase() === bucket.designation.trim().toLowerCase();
  const allowed = count === 0 || isAdmin;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!allowed || (count > 0 && !matches)) return;
    setBusy(true);
    try {
      await removeBucket(bucket.id);
      toast(count > 0 ? `Bucket deleted with ${count} CV${count === 1 ? '' : 's'}.` : 'Bucket deleted.');
      onClose();
      navigate('/buckets');
    } catch (error) {
      toast(errorText(error), 'bad');
      setBusy(false);
    }
  }

  return (
    <Dialog
      title={`Delete ${bucket.designation}?`}
      onClose={onClose}
      width="max-w-md"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          {allowed && (
            <Button type="submit" form="delete-bucket-form" variant="danger" loading={busy} disabled={count > 0 && !matches}>
              {count > 0 ? `Delete bucket and ${count} CV${count === 1 ? '' : 's'}` : 'Delete bucket'}
            </Button>
          )}
        </>
      }
    >
      <form id="delete-bucket-form" onSubmit={submit} className="space-y-3 text-sm">
        {count === 0 ? (
          <p>This bucket has no CVs. Its application link stops working. This cannot be undone.</p>
        ) : !allowed ? (
          <p>
            This bucket holds <strong>{count} CV{count === 1 ? '' : 's'}</strong>. Only an admin can delete a bucket with CVs in it.
            To keep the CVs out of the way instead, edit the bucket and set its status to Archived.
          </p>
        ) : (
          <>
            <p className="rounded-lg bg-red-50 px-3 py-2 text-red-900">
              This permanently deletes <strong>{count} CV{count === 1 ? '' : 's'}</strong>, their files, history and interview records,
              and the bucket itself. It cannot be undone. To keep them, archive the bucket instead (edit it and set its status to Archived).
            </p>
            <TextInput
              label={`Type "${bucket.designation}" to confirm`}
              autoFocus
              autoComplete="off"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
            />
          </>
        )}
      </form>
    </Dialog>
  );
}
