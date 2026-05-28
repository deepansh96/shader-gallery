import { Link, Navigate, Route, Routes, useParams, useSearchParams } from "react-router-dom";
import { galleryItems, getGalleryItem } from "./gallery/items";
import { ShaderStage } from "./template/ShaderStage";

function GalleryHome() {
  return (
    <main className="home-shell">
      <header className="home-header">
        <p className="eyebrow">Shader Gallery</p>
        <h1>Realtime graphics experiments built as routed gallery items.</h1>
        <p className="home-copy">
          A WebGL2-first Three.js playground for tactile shader demos, with a shared R3F stage,
          debug tooling, and static gallery thumbnails.
        </p>
      </header>

      <section className="gallery-grid" aria-label="Gallery items">
        {galleryItems.map((item) => (
          <Link className="gallery-card" key={item.slug} to={`/gallery/${item.slug}`}>
            <span className={`thumbnail ${item.thumbnailClass}`} aria-hidden="true" />
            <span className="card-body">
              <span className="card-kicker">{item.status}</span>
              <strong>{item.title}</strong>
              <span>{item.description}</span>
            </span>
          </Link>
        ))}
      </section>
    </main>
  );
}

function GalleryRoute() {
  const { slug } = useParams();
  const [searchParams] = useSearchParams();
  const item = getGalleryItem(slug);

  if (!item) {
    return <Navigate to="/" replace />;
  }

  return <ShaderStage item={item} debug={searchParams.get("debug") === "true"} />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<GalleryHome />} />
      <Route path="/gallery/:slug" element={<GalleryRoute />} />
    </Routes>
  );
}
