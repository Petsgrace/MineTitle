import React from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Home, FilePlus, Search, Map } from 'lucide-react'

export default function MobileNav() {
  const location = useLocation()
  const path = location.pathname

  // Web only for officers: Officer Portal entry is completely removed from mobile navigation.
  const navItems = [
    { label: 'Home', to: '/', icon: Home, active: path === '/' },
    { label: 'Apply', to: '/apply', icon: FilePlus, active: path === '/apply' },
    { label: 'Track', to: '/track', icon: Search, active: path === '/track' },
    { label: 'GIS', to: '/gis-map', icon: Map, active: path === '/gis-map' },
  ]

  return (
    <nav className="mobile-bottom-bar md:hidden">
      <div className="mobile-bottom-bar-inner">
        {navItems.map((item) => {
          const Icon = item.icon
          return (
            <Link
              key={item.label}
              to={item.to}
              className={`mobile-nav-item ${item.active ? 'active' : ''}`}
            >
              <div className="mobile-nav-icon-wrap">
                <Icon size={20} />
              </div>
              <span className="mobile-nav-label">{item.label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
