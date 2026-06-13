// SOTA 배정 — 테스트 영상/이미지 + 프레임 노트. 범용 MediaSection 래퍼.
import MediaSection from './MediaSection'

export default function AssignmentMediaSection({
  assignmentId,
  canUpload = true,
}: {
  assignmentId: string
  canUpload?: boolean
}) {
  return <MediaSection ownerType="sota_assignment" ownerId={assignmentId} canUpload={canUpload} />
}
