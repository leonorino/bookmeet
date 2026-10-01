export default function Home() {
  return (
    <main className="page-shell">
      <header className="site-header">
        <a className="wordmark" href="/" aria-label="Meeting Booking home">
          <span className="wordmark-icon" aria-hidden="true">M</span>
          Meeting Booking
        </a>
        <span className="header-note">Simple scheduling, made human</span>
      </header>

      <section className="hero" aria-labelledby="hero-title">
        <div className="hero-copy">
          <p className="eyebrow"><span /> A little more time for what matters</p>
          <h1 id="hero-title">Meetings that fit <em>your</em> day.</h1>
          <p className="intro">
            Share the times that work for you. Let people choose a moment that
            works for them. No back-and-forth required.
          </p>
          <div className="hero-actions">
            <a className="button button-primary" href="#how-it-works">
              See how it works <span aria-hidden="true">↗</span>
            </a>
            <span className="action-caption">For thoughtful conversations, big and small.</span>
          </div>
          <div className="trust-note"><span aria-hidden="true">✳</span> No account needed to book</div>
        </div>

        <div className="booking-card" aria-label="Example meeting availability">
          <div className="card-topline"><span>YOUR WEEK, AT A GLANCE</span><span className="live-dot">● &nbsp;YOUR TIME ZONE</span></div>
          <div className="calendar-heading"><div><span className="muted-label">AVAILABILITY</span><h2>A little time, set aside.</h2></div><span className="calendar-arrow" aria-hidden="true">↗</span></div>
          <div className="calendar">
            <div className="day-column"><span className="day-name">MON</span><span className="day-number">14</span><span className="slot slot-muted">9:30</span><span className="slot slot-muted">11:00</span><span className="slot slot-muted">2:00</span></div>
            <div className="day-column selected-day"><span className="day-name">TUE</span><span className="day-number">15</span><span className="slot">9:30</span><span className="slot slot-selected">11:00 <span aria-hidden="true">✓</span></span><span className="slot">2:00</span></div>
            <div className="day-column"><span className="day-name">WED</span><span className="day-number">16</span><span className="slot">10:00</span><span className="slot">1:30</span><span className="slot slot-muted">3:00</span></div>
          </div>
          <div className="card-footer"><span><i /> A good time is waiting</span><span>YOUR LINK, YOUR RULES</span></div>
          <div className="card-decoration" aria-hidden="true">✳</div>
        </div>
        <div className="hero-scribble" aria-hidden="true">↘</div>
      </section>

      <section id="how-it-works" className="how-section">
        <div><p className="eyebrow">A calmer way to coordinate</p><h2>Good things happen<br />when time lines up.</h2></div>
        <p>Meeting Booking helps organizers share availability and gives clients a simple way to choose a slot. Pick a time, and make room for the conversation.</p>
      </section>

      <footer className="site-footer"><span>Thoughtful meetings start here.</span><span>MADE FOR REAL LIFE &nbsp;✳</span></footer>
    </main>
  );
}
