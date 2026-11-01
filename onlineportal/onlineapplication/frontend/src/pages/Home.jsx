import React from 'react'
import { useNavigate } from 'react-router-dom'
import { Landmark, LayoutGrid, FileText, Search, ShieldCheck, ArrowRight, CheckCircle, Users, Clock, MapPin, Shield, Leaf } from 'lucide-react'

const Home = ({ user, setUser }) => {
    const navigate = useNavigate()

    const handlePrimaryCTA = () => {
        if (user) {
            navigate('/farmer-dashboard')
        } else {
            navigate('/signup')
        }
    }

    const handleStartApplication = () => {
        if (user) {
            navigate('/apply')
        } else {
            navigate('/signup')
        }
    }

    return (
        <div className="landing-page">
            {/* Hero Section with Photo Background */}
            <section className="hero-section">
                <div className="hero-photo-bg">
                    <img src="/hero-bg.png" alt="" className="hero-photo-img" />
                </div>
                <div className="hero-overlay"></div>

                <div className="hero-content">
                    <div className="hero-badge">
                        <div className="badge-icon">
                            <Landmark size={16} />
                        </div>
                        <span>Government of Zimbabwe</span>
                    </div>

                    <h1 className="hero-title">
                        One Stop Center<br />
                        <span className="hero-title-accent">Get Your Title Deeds Today</span>
                    </h1>

                    <p className="hero-subtitle">
                        The official digital platform for land registration. Apply for your Title Deed online,
                        track your application in real-time, and receive secure verification from authorized agencies.
                    </p>

                    <div className="hero-tagline">
                        <Leaf size={18} />
                        <span>Unlocking Land Potential</span>
                    </div>

                    <div className="hero-buttons">
                        {user ? (
                            <>
                                <button
                                    onClick={() => navigate('/farmer-dashboard')}
                                    className="hero-btn hero-btn-primary"
                                >
                                    <LayoutGrid size={20} />
                                    Go to Dashboard
                                    <ArrowRight size={18} />
                                </button>
                                <button
                                    onClick={() => navigate('/apply')}
                                    className="hero-btn hero-btn-secondary"
                                >
                                    Start Your Application
                                </button>
                            </>
                        ) : (
                            <>
                                <button
                                    onClick={() => navigate('/signup')}
                                    className="hero-btn hero-btn-primary"
                                >
                                    <Landmark size={20} />
                                    Get Started
                                    <ArrowRight size={18} />
                                </button>
                                <button
                                    onClick={() => navigate('/login')}
                                    className="hero-btn hero-btn-secondary"
                                >
                                    Sign In to Portal
                                </button>
                            </>
                        )}
                    </div>

                    <div className="hero-stats">
                        <div className="stat-item">
                            <div className="stat-number">300K+</div>
                            <div className="stat-label">Farmers Served</div>
                        </div>
                        <div className="stat-divider"></div>
                        <div className="stat-item">
                            <div className="stat-number">10</div>
                            <div className="stat-label">Provinces</div>
                        </div>
                        <div className="stat-divider"></div>
                        <div className="stat-item">
                            <div className="stat-number">24/7</div>
                            <div className="stat-label">Online Access</div>
                        </div>
                    </div>
                </div>
            </section>

            {/* Features Section */}
            <section className="features-section">
                <div className="section-header">
                    <h2 className="section-title">How It Works</h2>
                    <p className="section-subtitle">A streamlined process from application to collection</p>
                </div>

                <div className="features-grid">
                    <div className="feature-card feature-card-1">
                        <div className="feature-step">01</div>
                        <div className="feature-icon feature-icon-emerald">
                            <FileText size={28} />
                        </div>
                        <h3 className="feature-title">Submit Application</h3>
                        <p className="feature-desc">Complete the digital application form with your farm details and upload required documents securely.</p>
                    </div>

                    <div className="feature-card feature-card-2">
                        <div className="feature-step">02</div>
                        <div className="feature-icon feature-icon-blue">
                            <Search size={28} />
                        </div>
                        <h3 className="feature-title">Track Progress</h3>
                        <p className="feature-desc">Monitor your application through each verification stage with real-time status updates and notifications.</p>
                    </div>

                    <div className="feature-card feature-card-3">
                        <div className="feature-step">03</div>
                        <div className="feature-icon feature-icon-purple">
                            <ShieldCheck size={28} />
                        </div>
                        <h3 className="feature-title">Get Verified</h3>
                        <p className="feature-desc">Multi-agency verification through LIMS, ZLC, and Surveyor General ensures legitimate land ownership.</p>
                    </div>

                    <div className="feature-card feature-card-4">
                        <div className="feature-step">04</div>
                        <div className="feature-icon feature-icon-amber">
                            <CheckCircle size={28} />
                        </div>
                        <h3 className="feature-title">Collect Title Deed</h3>
                        <p className="feature-desc">Receive notification when your Title Deed is ready for collection at your district office.</p>
                    </div>
                </div>
            </section>

            {/* Welcome / Benefits Section with Farmer Image */}
            <section className="welcome-section">
                <div className="welcome-content">
                    <div className="welcome-text">
                        <div className="welcome-label">
                            <Shield size={16} />
                            <span>Trusted by Farmers Nationwide</span>
                        </div>
                        <h2 className="welcome-title">Welcome to the<br /><span className="welcome-title-accent">Title Deeds Portal</span></h2>
                        <ul className="benefits-list">
                            <li className="benefit-item">
                                <CheckCircle className="benefit-check" size={20} />
                                <span>Fast processing with digital workflow</span>
                            </li>
                            <li className="benefit-item">
                                <CheckCircle className="benefit-check" size={20} />
                                <span>Transparent tracking at every stage</span>
                            </li>
                            <li className="benefit-item">
                                <CheckCircle className="benefit-check" size={20} />
                                <span>Secure document storage</span>
                            </li>
                            <li className="benefit-item">
                                <CheckCircle className="benefit-check" size={20} />
                                <span>Email notifications on progress</span>
                            </li>
                            <li className="benefit-item">
                                <CheckCircle className="benefit-check" size={20} />
                                <span>Cumulative discounts for eligible beneficiaries</span>
                            </li>
                        </ul>
                        <button
                            onClick={handleStartApplication}
                            className="welcome-cta"
                        >
                            {user ? 'Start Your Application' : 'Start Your Application'}
                            <ArrowRight size={18} />
                        </button>
                    </div>
                    <div className="welcome-image-wrap">
                        <img src="/farmer-welcome.png" alt="Welcome - Zimbabwe farmer" className="welcome-image" />
                        <div className="welcome-image-overlay"></div>
                        <div className="welcome-floating-cards">
                            <div className="wf-card wf-card-1">
                                <Users size={20} />
                                <span>Multi-Agency Verification</span>
                            </div>
                            <div className="wf-card wf-card-2">
                                <Clock size={20} />
                                <span>Real-Time Updates</span>
                            </div>
                            <div className="wf-card wf-card-3">
                                <MapPin size={20} />
                                <span>All Districts Covered</span>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* CTA Section */}
            <section className="cta-section">
                <div className="cta-content">
                    <h2 className="cta-title">Ready to Secure Your Land?</h2>
                    <p className="cta-subtitle">Join thousands of farmers who have successfully obtained their Title Deeds through our portal.</p>
                    <div className="cta-buttons">
                        {user ? (
                            <button onClick={() => navigate('/farmer-dashboard')} className="cta-btn-primary">
                                Go to Dashboard
                            </button>
                        ) : (
                            <>
                                <button onClick={() => navigate('/signup')} className="cta-btn-primary">
                                    Register Now
                                </button>
                                <button onClick={() => navigate('/login')} className="cta-btn-secondary">
                                    Already have an account? Sign In
                                </button>
                            </>
                        )}
                    </div>
                </div>
            </section>
        </div>
    )
}

export default Home
