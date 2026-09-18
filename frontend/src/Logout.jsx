import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getScreenStyle } from './styles'

function Logout() {
    const navigate = useNavigate()
    const [showConfirm, setShowConfirm] = useState(true)

    const handleConfirmLogout = () => {
        sessionStorage.setItem('accesstoken', '')
        sessionStorage.setItem('refreshtoken', '')
        sessionStorage.setItem('username', '')
        setShowConfirm(false)
    }

    const handleCancel = () => {
        navigate('/swipe')
    }

    if (showConfirm) {
        return (
            <div style={{
                ...getScreenStyle(
                    'rgba(158, 123, 255, 0.4)',
                    'rgba(217, 184, 227, 0.25)',
                    'rgba(186, 151, 225, 0.4)',
                    'rgba(219, 185, 210, 0.3)'
                ),
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
            }}>
                {/* Overlay */}
                <div style={{
                    position: 'fixed',
                    inset: 0,
                    backgroundColor: 'rgba(0, 0, 0, 0.26)',
                    zIndex: 999
                }} />

                {/* Modal Popup */}
                <div style={{
                    position: 'relative',
                    zIndex: 1000,
                    backgroundColor: '#2c1a4f38',
                    border: '2px solid #debff7',
                    borderRadius: '20px',
                    padding: '40px 30px',
                    maxWidth: '400px',
                    textAlign: 'center',
                    boxShadow: '0 10px 40px rgba(0, 0, 0, 0.5)'
                }}>
                    <h2 style={{
                        fontSize: '24px',
                        fontFamily: 'Outfit, sans-serif',
                        fontWeight: 'bold',
                        margin: '0 0 16px 0',
                        color: '#debff7'
                    }}>
                        Log out?
                    </h2>
                    
                    <p style={{
                        fontSize: '16px',
                        fontFamily: 'Outfit, sans-serif',
                        color: '#ffffff',
                        marginBottom: '32px',
                        opacity: 0.9
                    }}>
                        Are you sure?
                    </p>

                    <div style={{
                        display: 'flex',
                        gap: '16px',
                        justifyContent: 'center'
                    }}>
                        <button
                            onClick={handleCancel}
                            style={{
                                padding: '10px 24px',
                                fontSize: '14px',
                                fontWeight: 'bold',
                                fontFamily: 'Outfit, sans-serif',
                                border: '2px solid #debff7',
                                borderRadius: '8px',
                                color: '#debff7',
                                backgroundColor: 'transparent',
                                cursor: 'pointer',
                                transition: 'all 0.3s ease'
                            }}
                            onMouseEnter={(e) => {
                                e.target.style.backgroundColor = '#debff7'
                                e.target.style.color = '#1d1133'
                            }}
                            onMouseLeave={(e) => {
                                e.target.style.backgroundColor = 'transparent'
                                e.target.style.color = '#debff7'
                            }}
                        >
                            Cancel
                        </button>
                        
                        <button
                            onClick={handleConfirmLogout}
                            style={{
                                padding: '10px 24px',
                                fontSize: '14px',
                                fontWeight: 'bold',
                                fontFamily: 'Outfit, sans-serif',
                                border: '2px solid #ff6b6b',
                                borderRadius: '8px',
                                color: '#ffffff',
                                backgroundColor: '#ff6b6b',
                                cursor: 'pointer',
                                transition: 'all 0.3s ease'
                            }}
                            onMouseEnter={(e) => {
                                e.target.style.backgroundColor = '#b93535'
                                e.target.style.borderColor = '#ff5252'
                            }}
                            onMouseLeave={(e) => {
                                e.target.style.backgroundColor = '#ff6b6b'
                                e.target.style.borderColor = '#ff6b6b'
                            }}
                        >
                            Log out
                        </button>
                    </div>
                </div>
            </div>
        )
    }

    return (
        <div style={{
            ...getScreenStyle(
                'rgba(158, 123, 255, 0.4)',
                'rgba(217, 184, 227, 0.25)',
                'rgba(186, 151, 225, 0.4)',
                'rgba(219, 185, 210, 0.3)'
            ),
            color: '#debff7',
            textAlign: 'center'
        }}>
            <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '32px'
            }}>
                <h1 style={{
                    fontSize: '48px',
                    fontFamily: 'Outfit, sans-serif',
                    fontWeight: 'bold',
                    margin: 0
                }}>You are logged out</h1>
                
                <a 
                    href="/" 
                    style={{
                        padding: '15px 35px',
                        fontSize: '18px',
                        fontWeight: 'bold',
                        fontFamily: 'Outfit, sans-serif',
                        border: '2px solid #debff7',
                        borderRadius: '50px',
                        color: '#debff7',
                        backgroundColor: '#1d1133',
                        textDecoration: 'none',
                        cursor: 'pointer',
                        transition: 'all 0.3s ease',
                        display: 'inline-block'
                    }}
                    onMouseEnter={(e) => {
                        e.target.style.backgroundColor = '#debff7'
                        e.target.style.color = '#1d1133'
                    }}
                    onMouseLeave={(e) => {
                        e.target.style.backgroundColor = '#1d1133'
                        e.target.style.color = '#debff7'
                    }}
                >
                    Return to Hooked
                </a>
            </div>
        </div>
    )
}
export default Logout