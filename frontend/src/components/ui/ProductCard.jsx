// The real, working card lives at ../ProductCard.jsx — it's tightly coupled to the
// app's real `group`-of-offers data shape (via cheapestByCountry/utils.js) and to
// CartContext, so it stays where existing imports (ResultsArea.jsx) already expect it.
// This re-export just makes it reachable from the `ui/` barrel alongside the other
// primitives, without a risky file move.
export { default } from '../ProductCard.jsx'
