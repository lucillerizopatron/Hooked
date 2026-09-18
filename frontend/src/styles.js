// -----------------------------------------------------------------------
// styles.js
// Parametrizeds styles for screens and buttons
// Author: Lucille Rizo Patron
// -----------------------------------------------------------------------

export const getScreenStyle = (c1, c2, c3, c4) => ({
    minHeight: '100vh',
    backgroundColor: '#18171d',
    backgroundImage: `
        radial-gradient(circle at 20% 30%, ${c1} 0%, transparent 30%),
        radial-gradient(circle at 80% 20%, ${c2} 0%, transparent 30%),
        radial-gradient(circle at 85% 85%, ${c3} 0%, transparent 30%),
        radial-gradient(circle at 15% 90%, ${c4} 0%, transparent 30%)
    `,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '20px',
    position: 'relative'
})

// button style to navigate among screens from swipe screen
// takes string sides: sideX to determine right or left placement
// and sideY to determine bottom or top placement
export const cornerButtonStyle = (sideX, sideY) => ({
    position: 'fixed',
    width: '50px',
    height: '50px',
    [sideX]: '15px',
    [sideY]: '15px',
    backgroundColor: '#a995dd4f',
    color: '#180d2b',
    fontSize: '30px',
    fontWeight: 'bold',
    border: 'none',
    borderRadius: '12px',
    cursor: 'pointer',   
    zIndex: 9999,
})

export const actionButtonStyle = (color, textColor) => ({
    padding: '15px 35px',
    fontSize: '16px',
    fontWeight: 'bold',
    fontFamily: 'Outfit, sans-serif',
    border: 'none',
    borderRadius: '50px',
    cursor: 'pointer',
    backgroundColor: color,
    color: textColor,
    transition: "transform 0.2s ease",
})