import React, { useEffect } from 'react'
import ReactDOM from 'react-dom'
import { X } from 'lucide-react'

const Modal = ({ isOpen, onClose, title, children, maxWidth = 'max-w-2xl' }) => {
    useEffect(() => {
        if (isOpen) {
            // Lock body scroll
            const originalOverflow = document.body.style.overflow
            document.body.style.overflow = 'hidden'

            // Handle escape key
            const handleEscape = (e) => {
                if (e.key === 'Escape') onClose()
            }
            document.addEventListener('keydown', handleEscape)

            return () => {
                document.body.style.overflow = originalOverflow
                document.removeEventListener('keydown', handleEscape)
            }
        }
    }, [isOpen, onClose])

    if (!isOpen) return null

    console.log('Modal rendering, isOpen:', isOpen, 'title:', title)
    const modalRoot = document.getElementById('modal-root') || document.body
    console.log('Modal root element:', modalRoot)

    return ReactDOM.createPortal(
        <div
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                zIndex: 999999,
                backgroundColor: 'rgba(0, 0, 0, 0.5)',
                backdropFilter: 'blur(4px)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '1rem'
            }}
            onClick={onClose}
        >
            <div
                className={`bg-white rounded-xl shadow-2xl w-full ${maxWidth}`}
                style={{
                    maxHeight: '90vh',
                    overflowY: 'auto',
                    position: 'relative'
                }}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="p-6 border-b flex justify-between items-center sticky top-0 bg-white z-10">
                    <h3 className="text-xl font-bold text-gray-900">{title}</h3>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                        aria-label="Close modal"
                    >
                        <X className="w-6 h-6 text-gray-500" />
                    </button>
                </div>

                {/* Content */}
                <div className="p-6">
                    {children}
                </div>
            </div>
        </div>,
        modalRoot
    )
}

export default Modal
