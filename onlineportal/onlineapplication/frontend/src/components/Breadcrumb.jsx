import React from 'react'
import { ChevronRight } from 'lucide-react'
import { Link } from 'react-router-dom'

const Breadcrumb = ({ items }) => {
    return (
        <div className="bg-white border-b border-gray-200 px-6 py-3">
            <div className="flex items-center gap-2 text-sm">
                {items.map((item, index) => (
                    <React.Fragment key={index}>
                        {index > 0 && <ChevronRight size={14} className="text-gray-400" />}
                        {item.path ? (
                            <Link
                                to={item.path}
                                className="text-emerald-600 hover:text-emerald-700 hover:underline font-medium transition"
                            >
                                {item.label}
                            </Link>
                        ) : (
                            <span className="text-gray-600 font-medium">{item.label}</span>
                        )}
                    </React.Fragment>
                ))}
            </div>
        </div>
    )
}

export default Breadcrumb
