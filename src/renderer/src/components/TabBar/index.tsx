import React, { useRef, useState } from 'react'
import { Dropdown } from 'antd'
import { PlusOutlined, SettingOutlined, CloseOutlined, UnorderedListOutlined } from '@ant-design/icons'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core'
import { SortableContext, horizontalListSortingStrategy, useSortable } from '@dnd-kit/sortable'
import { restrictToHorizontalAxis } from '@dnd-kit/modifiers'
import { CSS } from '@dnd-kit/utilities'
import { Session } from '../../../../shared/types'

import './index.css'

interface TabBarProps {
  sessions: Session[]
  activeSessionId: string | null
  onTabClick: (sessionId: string) => void
  onTabClose: (sessionId: string) => void
  onReorder: (activeId: string, overId: string) => void
  onNewConnection: () => void
  onOpenManager: () => void
  onOpenSettings: () => void
}

const TabContent: React.FC<{ session: Session }> = ({ session }) => (
  <>
    <span className={`tab-status ${session.connected ? 'connected' : 'disconnected'}`} />
    <span className="tab-title">{session.configName}</span>
  </>
)

interface SortableTabProps {
  session: Session
  isActive: boolean
  canDrag: boolean
  onTabClick: (sessionId: string) => void
  onTabClose: (sessionId: string) => void
  suppressClickRef: React.MutableRefObject<boolean>
}

const SortableTab: React.FC<SortableTabProps> = ({
  session,
  isActive,
  canDrag,
  onTabClick,
  onTabClose,
  suppressClickRef,
}) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: session.id,
    disabled: !canDrag,
  })

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`tab-item ${isActive ? 'active' : ''} ${isDragging ? 'tab-dragging' : ''}`}
      title={session.configName}
      onClick={() => {
        if (suppressClickRef.current) return
        onTabClick(session.id)
      }}
      {...attributes}
      {...listeners}
    >
      <TabContent session={session} />
      <button
        type="button"
        className="tab-close"
        title="关闭"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation()
          onTabClose(session.id)
        }}
      >
        <CloseOutlined />
      </button>
    </div>
  )
}

const TabBar: React.FC<TabBarProps> = ({
  sessions,
  activeSessionId,
  onTabClick,
  onTabClose,
  onReorder,
  onNewConnection,
  onOpenManager,
  onOpenSettings,
}) => {
  const [activeId, setActiveId] = useState<string | null>(null)
  const suppressClickRef = useRef(false)
  const canDrag = sessions.length > 1

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    })
  )

  const activeSession = sessions.find((s) => s.id === activeId) ?? null

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(String(event.active.id))
  }

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveId(null)
    // Swallow the click that the browser dispatches right after the drag's pointerup
    suppressClickRef.current = true
    setTimeout(() => {
      suppressClickRef.current = false
    }, 0)
    const { active, over } = event
    if (over && active.id !== over.id) {
      onReorder(String(active.id), String(over.id))
    }
  }

  const handleDragCancel = () => {
    setActiveId(null)
  }

  return (
    <div className="tab-bar">
      <div className="tab-bar-actions">
        <Dropdown
          menu={{
            items: [
              { key: 'new', label: '新建连接', icon: <PlusOutlined />, onClick: onNewConnection },
              { key: 'manager', label: '连接管理', icon: <UnorderedListOutlined />, onClick: onOpenManager },
            ],
          }}
          trigger={['click']}
          placement="bottomLeft"
        >
          <button type="button" className="tab-bar-icon-btn" title="新建连接">
            <PlusOutlined />
          </button>
        </Dropdown>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        modifiers={[restrictToHorizontalAxis]}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <div className="tab-strip">
          <SortableContext items={sessions.map((s) => s.id)} strategy={horizontalListSortingStrategy}>
            {sessions.map((session) => (
              <SortableTab
                key={session.id}
                session={session}
                isActive={session.id === activeSessionId}
                canDrag={canDrag}
                onTabClick={onTabClick}
                onTabClose={onTabClose}
                suppressClickRef={suppressClickRef}
              />
            ))}
          </SortableContext>
        </div>

        <DragOverlay>
          {activeSession ? (
            <div className="tab-item tab-overlay">
              <TabContent session={activeSession} />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      <div className="tab-bar-actions">
        <button type="button" className="tab-bar-icon-btn" title="设置" onClick={onOpenSettings}>
          <SettingOutlined />
        </button>
      </div>
    </div>
  )
}

export default TabBar
