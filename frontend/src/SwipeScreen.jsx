// -----------------------------------------------------------------------
// SwipeScreen.jsx
// Swipe Interface for Hooked
// Author: Lucille Rizo Patron, 
// Contributors: Eleanor Liu, Derek Geng
// -----------------------------------------------------------------------
/* eslint-disable react-hooks/rules-of-hooks */

import React from 'react'
import {useState, useRef, useEffect} from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import API_URL from './config'
import { getScreenStyle, cornerButtonStyle, actionButtonStyle } from './styles'
import searchIcon from './search_button.png'
import logoutIcon from './logout_button.png'
import { useAuth } from "./AuthContext"
import Navigation from "./Navigation"

// Renders the swipe screen interface where users can like or skip songs 
// via swiping, buttons, or keyboard keys. Displays 30-second audio 
// previews and song info to help users curate a list of liked songs.
function SwipeScreen() {

    // redirect to login if not authenticated
    if (!sessionStorage.getItem('username')) {
        window.location.replace(
            API_URL + '/auth/login?originalurl=' + window.location.pathname
        )
        return null
    }

    // ------------- Screen Flow -----------------------------------------

    // enables flow from one screen to another
    const navigate = useNavigate()

    // catch data passed from search screen
    const location = useLocation()

    // ------------- States + Refs ---------------------------------------

    // tracks current position 
    const [offsetX, setOffsetX] = useState(0)

    // isDragging tracks whether the user is currently dragging the card
    const [isDragging, setIsDragging] = useState(false)

    // horizontal start position of the drag (in pixels)
    const dragStartX = useRef(0)

    // the song currently on screen
    const [currentSong, setCurrentSong] = useState(null)

    // swipe card component
    const cardRef = useRef(null)

    // message shows like or dislike after swiping
    const [message, setMessage] = useState("")
    
    // store user id
    const { user } = useAuth() 
    const [userId, setUserId] = useState(null)

    // stable session id for this swipe session — generated once on mount
    const sessionId = useRef(crypto.randomUUID())

    // how the current song was served ('similarity' or 'exploration')
    const [servedBy, setServedBy] = useState(null)

    // store last action for undo functionality
    const [lastAction, setLastAction] = useState(null)

    // whether user can undo their last action
    const [canUndo, setCanUndo] = useState(false)

    // audio player state
    const audioRef = useRef(null)
    const [isPlaying, setIsPlaying] = useState(false)
    const [currentTime, setCurrentTime] = useState(0)
    const [duration, setDuration] = useState(0)

    // ------------------ Song Fetching ----------------------------------

    // fetch user id from JWT-protected endpoint
    useEffect(() => {
        async function fetchUserAuth() {
            const response = await fetch(`${API_URL}/api/getuserinfo`, {
                headers: {
                    'Authorization': 'Bearer ' + sessionStorage.getItem('accesstoken'),
                    'Accept': 'application/json',
                }
            })
            if (response.status === 401 || response.status === 422) {
                window.location.replace(
                    API_URL + '/auth/login?originalurl=' + window.location.pathname
                )
                return
            }
            if (response.ok) {
                const data = await response.json()
                if (data && data.user_id) setUserId(data.user_id)
            }
        }
        fetchUserAuth()
    }, [])

    // send user like/dislike action to database, then fetch next song
    // takes a string action, 'like' or 'dislike', as a parameter
    async function handleAction(action) {
        setLastAction({action, song: currentSong})
        setCanUndo(true)

        try {
            const response = await fetch(`${API_URL}/api/songs/action`, {
                method: "POST",
                headers: {
                    'Authorization': 'Bearer ' + sessionStorage.getItem('accesstoken'),
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    song_id: currentSong.song_id,
                    action,
                    served_by: servedBy,
                    session_id: sessionId.current
                })
            })
            if (response.status === 401 || response.status === 422) {
                window.location.replace(
                    API_URL + '/auth/login?originalurl=' + window.location.pathname
                )
                return
            }
            if (!response.ok) {
                throw new Error(`Response status: ${response.status}`)
            }
            await fetchNextSong()
        } catch (error) {
            console.error("Action error:", error.message)
            setMessage("Action failed, please try again.")
            setLastAction(null)
            setCanUndo(false)
        }
    }

    async function handleUndo() {
        if (!lastAction || !lastAction.song) {
            return
        }    
        try {
            await removeSongAction(lastAction.song.song_id, userId)
            setMessage("Undo!")
            setCurrentSong(lastAction.song)
            setOffsetX(0)
            setLastAction(null)
            setCanUndo(false)
        } catch (error) {
            console.error("Undo action error:", error.message)
            setMessage("Undo failed, please try again.")
        }
    }

    // fetch next song from backend & reset visual state for new song card
    async function fetchNextSong() {
        try {
            const response = await fetch(`${API_URL}/api/songs/next`, {
                headers: {
                    'Authorization': 'Bearer ' + sessionStorage.getItem('accesstoken'),
                    'Accept': 'application/json',
                }
            })
            if (response.status === 401 || response.status === 422) {
                window.location.replace(
                    API_URL + '/auth/login?originalurl=' + window.location.pathname
                )
                return
            }
            if (!response.ok) {
                throw new Error(`Response status: ${response.status}`)
            }

            const data = await response.json()

            // reset visual state for swipe card
            setOffsetX(0)

            if (data && data.song_id) {
                setCurrentSong(data)
                setServedBy(data.served_by || null)
                setMessage("")
            } else {
                setCurrentSong(null)
                setMessage("No more songs!")
            }

        } catch (error) {
            console.error("Fetch error:", error.message)
            setCurrentSong(null)
            setMessage("Server Error")
        }
    }

    // initial load: fetch first song to start swipe session
    useEffect(() => {
        // check for user authentication before song fetch
        if (!userId) {
            console.warn("[SwipeScreen] userId is null: cancel song fetch.")
            return
        }

        async function initializeSong() {
            try {
            // check for song passed from another screen
            let clickedSong = null
            if (location.state) {
                clickedSong = location.state.song
            }

            if (clickedSong) {
                setCurrentSong(clickedSong)
            } else {
                await fetchNextSong()
            }

            } catch (error) {
            console.error("Initialization failed:", error)
            }
        }

        initializeSong()
    }, [userId, location.state])

    // delete a liked song, takes an integer song id and removes it from the 
    // user's liked songs list
    async function removeSongAction(songId) {
        try {
            console.log("[SwipeScreen] Undoing song action for song with id:", songId)
                
            const response = await fetch(`${API_URL}/api/songs/action/${songId}`, {
                method: 'DELETE',
                headers: { 
                    "Content-Type": "application/json",
                    'Authorization': 'Bearer ' + sessionStorage.getItem('accesstoken'),
                }
            })

            if (response.status === 401 || response.status === 422) {
                window.location.replace(
                    API_URL + '/auth/login?originalurl=' + window.location.pathname
                )
                return
            }

            if (response.ok) {
                console.log("[SwipeScreen] Successfully undid song action")
                // update UI by filtering out deleted song
            } else {
                throw new Error(`Undo failed with status: ${response.status}`)
            }

        } catch (error) {
            console.error("[SwipeScreen] Error undoing song action:", error.message)
        }
    }

// -----------------------  Drag Swipe -------------------------------
    
    // triggers the card fly-off animation (left or right) based on
    // user action via drag, button click, or keyboard keys
    // takes a string action, 'like' or 'dislike', as parameters
    const doSwipe = (action) => {
        // large offset to slide completely off screen
        const flyOff = action === 'like' ? 1500 : -1500
        setOffsetX(flyOff)

        setMessage(action === 'like' ? "♥ Liked!" : "✕ Skipped!")

        // pause to let transition finish before new card data
        setTimeout(() => {
            handleAction(action) 
        }, 450)
    }

    // Sets state to dragging started
    // takes mouse or touch event as param
    const dragStart = (event) => {
        setIsDragging(true)
        // capture exact position of click/touch start
        dragStartX.current = event.touches ? event.touches[0].pageX : event.pageX
    }

    // Updates position state as the card is dragged
    useEffect(() => {
        // calculate how far mouse/touch has moved
        const handleMouseMove = (event) => {
            if (!isDragging) return
            const displacement = event.pageX - dragStartX.current
            setOffsetX(displacement)
        }

        const handleTouchMove = (event) => {
            if (!isDragging) return
            const displacement = event.touches[0].pageX - dragStartX.current
            setOffsetX(displacement)
        }
        
        // Checks whether the user liked (dragged the card right), 
        // skipped (dragged the card left), or didn't decide (didn't drag
        // far enough). Sets state to dragging ended.
        const handleMouseUp = () => {
            if (!isDragging) return

            const dragThreshold = 150

            // if user dragged past threshold pixels, it counts as swipe
            if (offsetX > dragThreshold) { //dragged right
                doSwipe('like')
            } else if (offsetX < -dragThreshold) { //dragged left
                doSwipe('dislike')
            } else { //not dragged enough
                setOffsetX(0)
                setMessage("")
            }
            setIsDragging(false)
        }
        
        // respond to user mouse and touch movements
        window.addEventListener('mousemove', handleMouseMove)
        window.addEventListener('mouseup', handleMouseUp)
        window.addEventListener('touchmove', handleTouchMove, { passive: true })
        window.addEventListener('touchend', handleMouseUp)
        // clean up listeners
        return () => {
            window.removeEventListener('mousemove', handleMouseMove)
            window.removeEventListener('mouseup', handleMouseUp)
            window.removeEventListener('touchmove', handleTouchMove)
            window.removeEventListener('touchend', handleMouseUp)
        }
    }, [isDragging, offsetX])

    // format timestamp as mm:ss
    const formatTime = (seconds) => {
        if (!seconds || isNaN(seconds)) return '0:00'
        const mins = Math.floor(seconds / 60)
        const secs = Math.floor(seconds % 60)
        return `${mins}:${secs.toString().padStart(2, '0')}`
    }

    // auto-play when song changes or page loads
    useEffect(() => {
        if (audioRef.current && currentSong) {
            const attemptPlay = () => {
                audioRef.current?.play()
                    .then(() => setIsPlaying(true))
                    .catch(err => console.log('Autoplay prevented by browser:', err))
            }
            
            // Try to play immediately and also on loadeddata event
            attemptPlay()
            audioRef.current.addEventListener('loadeddata', attemptPlay)
            
            return () => {
                audioRef.current?.removeEventListener('loadeddata', attemptPlay)
            }
        }
    }, [currentSong])

    // ------------------- Keyboard Swipe --------------------------------  

    // Handle keyboard left and right arrow keys
    useEffect(() => { 
        // takes keyboard event e as param
        const handleKeyPress = (event) => {
            if (event.code === 'Space') {
                event.preventDefault()
                if (audioRef.current) {
                    if (isPlaying) {
                        audioRef.current.pause()
                    } else {
                        audioRef.current.play()
                    }
                    setIsPlaying(!isPlaying)
                }
                return
            }
            if (Math.abs(offsetX) > 100) return // prevent key spamming
            if (event.key === 'ArrowLeft') doSwipe('dislike')
            if (event.key === 'ArrowRight') doSwipe('like')
            if (event.code === 'Backspace') handleUndo()
        }

        // respond to user keyboard actions
        window.addEventListener('keydown', handleKeyPress)
        // clean up listeners
        return () => window.removeEventListener('keydown', handleKeyPress)
    }, [currentSong, isPlaying, canUndo])


    // --------------------- Swipe Screen Rendering ----------------------

    // main swipe UI
    return (
        <div style={getScreenStyle(
            'rgba(158, 123, 255, 0.4)',
            'rgba(0, 217, 255, 0.25)',
            'rgba(112, 59, 173, 0.4)',
            'rgba(0, 128, 128, 0.3)'
        )}> 

            <Navigation />

            {/* if no song loaded, show final message or loading screen */}
            {!currentSong ? (
                <p style={{color: 'white', 
                           fontSize: '18px', 
                           textAlign: 'center'}}>
                    {message || "Loading..."}
                </p>
            ) : (   
                /* if song loaded, show swipe screen */
                <>
                    {/* liked/disliked message after swipe above card*/}
                    <p className="swipe-message-style">{message}</p>

                    {/* swipe card */}
                    <div
                        ref = {cardRef}
                        className="swipe-card-style"
                        style={{
                            position: 'relative',
                            transition: isDragging
                                // if dragging, card sticks to mouse 
                                ? 'none' 
                                // not dragging, card flies off or snaps back with curve
                                : 'transform 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
                            transform: 
                                // mimic how card in real life slides off
                                `translateX(${offsetX}px) rotate(${offsetX / 20}deg)`, 
                            // ensure swipe card stays on top of everything
                            zIndex: isDragging ? 100 : 1 
                        }}
                        onMouseDown={dragStart}
                        onTouchStart={dragStart}
                    >
                        {/* undo action button */}
                        <button 
                            style={{...cornerButtonStyle('right', 'top'),
                                backgroundColor: '#18171d00'
                            }}
                            onClick={handleUndo}>
                            ⟲
                        </button> 

                        {/* album art */}
                        {/* display song image or a default music icon */}
                        {currentSong.song_image_url ? (
                            <img 
                                src={currentSong.song_image_url} 
                                alt=''
                                className="swipe-album-art-style"
                                // prevent image dragging
                                onDragStart={(event) => event.preventDefault()}
                            />
                        ) : (
                            <p style={{fontSize: '120px', 
                                       margin: '0 0 25px 0'}}>♫</p>
                        )}
                        {/* audio element */}
                        <audio 
                            ref={audioRef}
                            src={currentSong.preview_mp3_url} 
                            onPlay={() => setIsPlaying(true)}
                            onPause={() => setIsPlaying(false)}
                            onTimeUpdate={() => audioRef.current && setCurrentTime(audioRef.current.currentTime)}
                            onLoadedMetadata={() => audioRef.current && setDuration(audioRef.current.duration)}
                        />

                        {/* custom audio player */}
                        <div style={{
                            display: 'flex',
                            justifyContent: 'center',
                            alignItems: 'center',
                            gap: '12px',
                            marginTop: '20px',
                            padding: '12px',
                            backgroundColor: 'rgba(0, 0, 0, 0.3)',
                            borderRadius: '8px'
                        }}>
                            <button
                                onClick={() => {
                                    if (audioRef.current) {
                                        if (isPlaying) audioRef.current.pause()
                                        else audioRef.current.play()
                                    }
                                }}
                                style={{
                                    background: 'none',
                                    border: 'none',
                                    color: '#debff7',
                                    fontSize: '18px',
                                    cursor: 'pointer',
                                    fontWeight: 'bold'
                                }}
                                title="Play/Pause (Space)"
                            >
                                {isPlaying ? '⏸' : '▶'}
                            </button>

                            {/* progress bar */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
                                <input
                                    type="range"
                                    min="0"
                                    max={duration || 0}
                                    value={currentTime}
                                    onChange={(e) => {
                                        const newTime = parseFloat(e.target.value)
                                        setCurrentTime(newTime)
                                        if (audioRef.current) audioRef.current.currentTime = newTime
                                    }}
                                    style={{
                                        flex: 1,
                                        height: '3px',
                                        borderRadius: '2px',
                                        backgroundColor: '#444',
                                        outline: 'none',
                                        cursor: 'pointer'
                                    }}
                                />
                                <span style={{ color: '#cdbfea', fontSize: '10px', width: '50px', textAlign: 'right', fontWeight: 'bold' }}>
                                    {formatTime(currentTime)} / {formatTime(duration)}
                                </span>
                            </div>
                        </div>

                        {/* song info */}
                        <h2 style={{
                            margin: '0 0 8px 0', 
                            fontFamily: 'Outfit, sans-serif', 
                            marginTop: '20px'
                        }}> 
                            {currentSong.song_name}</h2>
                        <p style={{
                            color: '#ffffffad', 
                            fontFamily: 'Outfit, sans-serif', 
                            margin: 0
                        }}> 
                            {currentSong.artist_name}</p>

                        {/* user instructions */}
                        <p style={{
                            color: '#deb6ff9d', 
                            fontFamily: 'Outfit, sans-serif', 
                            fontSize: '13px', 
                            marginTop: '20px'
                        }}>
                            Swipe left to skip, right to like
                        </p>
                        <p style={{
                            color: '#888', 
                            fontFamily: 'Outfit, sans-serif', 
                            fontSize: '11px', 
                            marginTop: '6px'
                        }}>
                            <strong>Keys:</strong> Space (play/pause) | ← (skip) | → (like) | Backspace (undo)
                        </p>
                        
                        {/* Like and skip buttons (as an alternative to swiping) */}
                        <div style={{
                            display: 'flex', 
                            justifyContent: 'center', 
                            gap: '45px', 
                            marginTop: '25px'
                        }}>
                            <button style={actionButtonStyle('#bea2ff', '#1d1133')}
                                onClick={() => doSwipe('dislike')}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.transform = "translateY(-4px) scale(1.08)";
                                    e.currentTarget.style.boxShadow = "0 0 12px rgba(225, 191, 247, 0.85), 0 0 26px rgba(194, 124, 255, 0.65)";
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.transform = "translateY(0) scale(1)";
                                    e.currentTarget.style.boxShadow = "none";
                                }}
                                >
                                ✕ Skip
                            </button>
                            <button style={actionButtonStyle('#50fff6', '#1d1133')}
                                onClick={() => doSwipe('like')}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.transform = "translateY(-4px) scale(1.08)";
                                    e.currentTarget.style.boxShadow = "0 0 12px rgba(191, 247, 242, 0.85), 0 0 26px rgba(124, 196, 255, 0.65)";
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.transform = "translateY(0) scale(1)";
                                    e.currentTarget.style.boxShadow = "none";
                                }}
                                >
                                ♥ Like
                            </button>
                        </div>

                    </div>

                </>)} 
                
        </div>
    )
}

export default SwipeScreen
