import Banner from '../components/Banner.jsx';
import Navbar from '../components/Navbar.jsx';
import Hero from '../components/Hero.jsx';
import Modules from '../components/Modules.jsx';
import SystemStatus from '../components/SystemStatus.jsx';
import AccessCTA from '../components/AccessCTA.jsx';
import Footer from '../components/Footer.jsx';

export default function Landing() {
  return (
    <div className="min-h-screen bg-slate-50">
      <Banner />
      <Navbar />
      <main>
        <Hero />
        <Modules />
        <SystemStatus />
        <AccessCTA />
      </main>
      <Footer />
    </div>
  );
}
