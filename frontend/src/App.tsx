// Composition root. Owned by the orchestrator; do not modify.
// Renders the browse frame, then overlays the deep surface + modals when open.
import { useEffect } from 'react'
import { useStore } from './store'
import { Layout } from './components/layout/Layout'
import { Inspector } from './components/inspector/Inspector'
import { GroupEditor } from './components/groups/GroupEditor'
import { CollectionPicker } from './components/collections/CollectionPicker'

export default function App() {
  const init = useStore((s) => s.init)
  const inspector = useStore((s) => s.inspector)
  const groupEditor = useStore((s) => s.groupEditor)
  const collectionPicker = useStore((s) => s.collectionPicker)

  useEffect(() => {
    void init()
  }, [init])

  return (
    <>
      <Layout />
      {inspector && <Inspector />}
      {groupEditor && <GroupEditor />}
      {collectionPicker && <CollectionPicker />}
    </>
  )
}
