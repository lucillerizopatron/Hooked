// -----------------------------------------------------------------------
// WelcomePage.jsx
// Swipe interface for Hooked (in progress)
// Authors: Eleanor Liu, Lucille Rizo Patron
// -----------------------------------------------------------------------

import React from 'react'
import {useCallback, useEffect} from 'react'
import { useNavigate} from 'react-router-dom'
import API_URL from './config'
import Circle from "./AnimatedCircle.jsx"
import musicNote1 from './musical-note-1.png'
import musicNote2 from './musical-note-2.png'
import { getScreenStyle } from './styles'
import './index.css'

function WelcomePage(){
    // this makes it go from one screen to another
    const navigate = useNavigate()

    function handleLoginClick() {
        navigate('/login')
        console.log("login button clicked, teleport to login pg")
    }

    function handleGoogleClick() {
        console.log("Google login button clicked, redirecting to Google OAuth")
        window.location.href = `${API_URL}/auth/login`;
    }

    function handleCreateClick() {
        console.log("create button clicked, teleport to login pg")
        navigate('/signup')
    }

    const handleKeyPress = useCallback((e) => {
        if (e.key === 'L' || e.key === "l") {
            console.log('L key = Login pressed. teleport to login page.')
            navigate('/login')
        }
        if (e.key === 'C' || e.key === "c") {
            console.log('c key pressed. teleport to create acc page.')
            navigate('/signup')
        }
    }, [navigate])

    useEffect(() => { 
        window.addEventListener('keydown', handleKeyPress)
        return () => window.removeEventListener('keydown', handleKeyPress)
    }, [handleKeyPress])


    
    return(
        <div style = {{...getScreenStyle(
            'rgba(158, 123, 255, 0.4)',
            'rgba(68, 161, 178, 0.25)',
            'rgba(112, 59, 173, 0.4)',
            'rgba(134, 191, 219, 0.37)'),
            color: '#debff7'}}>
            
            <div className = "welcome-card-style">

                <div className = "hooked-header-style"
                style = {{fontSize: '100px'}}>
                    <img
                        src={musicNote2}
                        alt="♫"
                        style={{
                            width: "100px",
                            height: "100px",
                            objectFit: "contain",
                            display: "block",
                        }}
                    />
                </div>

                <div className = "hooked-header-style">
                    Hooked 
                </div>

                <div style = {{marginBottom: '85px'}}> Reel in Your Next Playlist </div>
                    {/* teleports to either login or signup*/}

                <button className = 'welcome-button' onClick={(handleLoginClick)}>
                        Login
                    </button>

                <button className = 'welcome-button' onClick={(handleCreateClick)}>
                        Sign Up
                </button>

                <button className = 'welcome-button' onClick={handleGoogleClick}
                    style={{backgroundColor: '#9bf0ff', marginBottom: '50px'}}>
                    Continue with Google
                </button>      
            
            </div>
                        <Circle image={musicNote1}/>
                        <Circle image={musicNote1}/>
                        <Circle image={musicNote1}/>
                        <Circle image={musicNote1}/>
                        <Circle image={musicNote2}/>
                        <Circle image={musicNote2}/>                    
                        <Circle image={musicNote2}/>
                        <Circle image={musicNote2}/>
                        <Circle image={musicNote2}/>
        </div>
    )
}

// -------------------- EXPORT --------------------
export default WelcomePage