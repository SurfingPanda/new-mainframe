import Banner from '../components/Banner.jsx';
import Navbar from '../components/Navbar.jsx';
import Hero from '../components/Hero.jsx';
import Modules from '../components/Modules.jsx';
import SystemStatus from '../components/SystemStatus.jsx';
import AccessCTA from '../components/AccessCTA.jsx';
import Footer from '../components/Footer.jsx';
import Reveal from '../components/Reveal.jsx';

export default function Landing() {
  return (
    <div className="min-h-screen bg-slate-50">
      <Banner />
      <Navbar />
      <main>
        <Reveal direction="fade" duration={900}>
          <Hero />
        </Reveal>
        <Reveal direction="up">
          <Modules />
        </Reveal>
        <Reveal direction="up">
          <SystemStatus />
        </Reveal>
        <Reveal direction="up" duration={800}>
          <AccessCTA />
        </Reveal>
      </main>
      <Reveal direction="fade">
        <Footer />
      </Reveal>
    </div>
  );
}
