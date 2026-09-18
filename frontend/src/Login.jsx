// -----------------------------------------------------------------------
// Login.jsx
// Login interface for Hooked (in progress)
// Authors: Eleanor Liu, Lucille Rizo Patron
// -----------------------------------------------------------------------

import {useState} from 'react'
import { useNavigate } from 'react-router-dom'
import API_URL from './config'
import { getScreenStyle, cornerButtonStyle } from './styles'
import './index.css'
import Circle from "./AnimatedCircle.jsx"
import musicNote1 from './musical-note-1.png'
import musicNote2 from './musical-note-2.png'
import { useAuth } from './AuthContext'

function Login(){

    // this makes it go from one screen to another
    const navigate = useNavigate()
    
    const [username, setUsername] = useState("")
    const [password, setPassword] = useState("")
    const [resendMsg, setResendMsg] = useState("")
    const [showPassword, setShowPassword] = useState(false)

    const handleResend = async () => {
        const email = window.prompt("Enter the email you signed up with:")
        if (!email) return
        const res = await fetch(`${API_URL}/auth/resend-verification`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email }),
        })
        const data = await res.json().catch(() => ({}))
        if (data.status === "already_verified") {
            setResendMsg("Your email has already been verified.")
        } else {
            setResendMsg("If that email exists, a verification link was sent.")
        }
    }

    const { fetchUser } = useAuth()

    const handleBackButton = () => {
        navigate('/')
    }

    async function handleDone(myUsername, myPassword){
        const result = await fetch(`${API_URL}/api/checkpw`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: myUsername, password: myPassword })
        })
        console.log("status:", result.status) 
        const data = await result.json()
        console.log("data:", data)  

        if (!data){
            alert('Wrong username or password!')
        }
        if (data.logged_in) {
            sessionStorage.setItem('username', data.username)
            sessionStorage.setItem('accesstoken', data.accesstoken)
            sessionStorage.setItem('refreshtoken', data.refreshtoken)
            await fetchUser()
            if (!data.email_verified) {
                alert("Heads up: your email isn't verified yet. Check your inbox or use 'Resend verification email'.")
            }
            navigate(data.has_preferences ? '/swipe' : '/seedprefs')
        } else {
            alert(data.error || 'Wrong username or password!')
        }
    }

    return (
        <div style = {{...getScreenStyle(
            'rgba(170, 109, 217, 0.4)',
            'rgba(230, 167, 255, 0.64)',
            'rgba(186, 151, 225, 0.4)',
            'rgba(154, 177, 255, 0.69)'),
            color: '#debff7'}}>

            <div className = 'welcome-card-style'> 

            <div className = 'login-header-style'> 
                Account Login
            </div>

            <button style = {{...cornerButtonStyle('top', 'left')}} onClick={handleBackButton}>
                ⬅
            </button>

            <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
                <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Username"
                    className='input-login'
                    style={{ width: '100%', maxWidth: '300px' }}
                />

                <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Password"
                    className='input-login'
                    style={{ width: '100%', maxWidth: '300px' }}
                />

                <button 
                    className = "secondary-login-button"
                    onClick={() => setShowPassword(!showPassword)}
                    onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = "rgba(222, 191, 247, 0.2)";
                        e.currentTarget.style.transform = "translateY(-3px) scale(1.02)";
                        e.currentTarget.style.boxShadow =
                            "0 0 12px rgba(222, 191, 247, 0.65), 0 0 24px rgba(124, 196, 255, 0.4)";
                    }}
                    onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = "transparent";
                        e.currentTarget.style.transform = "translateY(0) scale(1)";
                        e.currentTarget.style.boxShadow = "none";
                    }}
                >
                    {showPassword ? "Hide Password" : "Show Password"}
                </button>

                <button 
                    className = "login-button"
                    onClick={() => handleDone(username, password)}
                    onMouseEnter={(e) => {
                        e.target.style.backgroundColor = '#bfdfea'
                        e.currentTarget.style.transform = "translateY(-3px) scale(1.02)";
                        e.currentTarget.style.boxShadow =
                            "0 0 12px rgba(222, 191, 247, 0.65), 0 0 24px rgba(124, 196, 255, 0.4)";
                    }}
                    onMouseLeave={(e) => {
                        e.target.style.backgroundColor = '#debff7'
                        e.currentTarget.style.transform = "translateY(0) scale(1)";
                        e.currentTarget.style.boxShadow = "none";
                    }}
                >
                    Login
                </button>

                <div style={{ borderTop: '1px solid #debff730', width: '100%', margin: '12px 0' }} />

                <button 
                    className = "secondary-login-button"
                    onClick={() => navigate('/forgot-password')}
                    onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = "rgba(222, 191, 247, 0.2)";
                        e.currentTarget.style.transform = "translateY(-3px) scale(1.02)";
                        e.currentTarget.style.boxShadow =
                            "0 0 12px rgba(222, 191, 247, 0.65), 0 0 24px rgba(124, 196, 255, 0.4)";
                    }}
                    onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = "transparent";
                        e.currentTarget.style.transform = "translateY(0) scale(1)";
                        e.currentTarget.style.boxShadow = "none";
                    }}
                >
                    Forgot Password?
                </button>

                <button 
                    className = "secondary-login-button"
                    onClick={() => navigate('/forgot-username')}
                    onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = "rgba(222, 191, 247, 0.2)";
                        e.currentTarget.style.transform = "translateY(-3px) scale(1.02)";
                        e.currentTarget.style.boxShadow =
                            "0 0 12px rgba(222, 191, 247, 0.65), 0 0 24px rgba(124, 196, 255, 0.4)";
                    }}
                    onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = "transparent";
                        e.currentTarget.style.transform = "translateY(0) scale(1)";
                        e.currentTarget.style.boxShadow = "none";
                    }}
                >
                    Forgot Username?
                </button>

                <button 
                    className = "secondary-login-button"
                    onClick={handleResend}
                    onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = "rgba(222, 191, 247, 0.2)";
                        e.currentTarget.style.transform = "translateY(-3px) scale(1.02)";
                        e.currentTarget.style.boxShadow =
                            "0 0 12px rgba(222, 191, 247, 0.65), 0 0 24px rgba(124, 196, 255, 0.4)";
                    }}
                    onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = "transparent";
                        e.currentTarget.style.transform = "translateY(0) scale(1)";
                        e.currentTarget.style.boxShadow = "none";
                    }}
                >
                    Resend Verification Email
                </button>

                {resendMsg && <p style={{ color: '#a9d5ff', fontSize: '13px', marginTop: '8px' }}>{resendMsg}</p>}

            </div>
        </div>
            <Circle image={musicNote1} alpha={0.008}/>            
            <Circle image={musicNote1} alpha={0.008}/>    
            <Circle image={musicNote1} alpha={0.008}/>    
            <Circle image={musicNote2} alpha={0.008}/>    
            <Circle image={musicNote2} alpha={0.008}/>    
            <Circle image={musicNote2} alpha={0.008}/>
        </div>
    );
}

// -------------------- EXPORT --------------------
export default Login