/**
 * Tipos compartidos entre cliente y servidor.
 * Este módulo NO debe tener dependencias: es el contrato del protocolo.
 */

export const LANGUAGES = ['es', 'en', 'fr', 'ca'] as const;
export type Language = (typeof LANGUAGES)[number];

export const LANGUAGE_NAMES: Record<Language, string> = {
  es: 'español',
  en: 'inglés',
  fr: 'francés',
  ca: 'catalán',
};

export const DEFAULT_CATEGORIES: Record<Language, string[]> = {
  es: [
    'Animal', 'Ave', 'Mamífero', 'Reptil', 'Anfibio', 'Pez', 'Marisco', 'Insecto', 'Arácnido', 'Invertebrado',
    'Árbol', 'Flor', 'Planta', 'Fruta', 'Verdura', 'Hortaliza', 'Setas', 'Especias', 'Condimento', 'Semilla',
    'Comida', 'Bebida', 'Postre', 'Dulce', 'Pan', 'Queso', 'Embutido', 'Carne', 'Plato', 'Bollería',
    'Helado', 'Cerveza', 'Vino', 'Licor', 'Refresco',
    'Nombre', 'Apellido', 'Profesión', 'Oficio', 'Empleo', 'Título', 'Personaje', 'Superhéroe', 'Héroe', 'Villano',
    'Dios', 'Leyenda', 'Autor', 'Pintor', 'Actor', 'Deportista', 'Músico', 'Científico', 'Inventor', 'Escritor',
    'Ciudad', 'Pueblo', 'País', 'Continente', 'Capital', 'Montaña', 'Río', 'Lago', 'Mar', 'Isla',
    'Desierto', 'Bosque', 'Selva', 'Playa', 'Cueva', 'Volcán', 'Puerto', 'Aeropuerto', 'Estadio',
    'Objeto', 'Herramienta', 'Utensilio', 'Electrodoméstico', 'Mueble', 'Ropa', 'Calzado', 'Accesorio', 'Joya',
    'Vehículo', 'Transporte', 'Máquina', 'Aparato', 'Dispositivo',
    'Deporte', 'Juego', 'Hobby', 'Pasatiempo', 'Competencia',
    'Instrumento musical', 'Canción', 'Banda', 'Álbum',
    'Película', 'Libro', 'Novela', 'Cuento',
    'Marca', 'Empresa', 'Producto',
    'Color', 'Forma', 'Material', 'Metal', 'Roca', 'Mineral', 'Gema',
    'Planeta', 'Estrella', 'Constelación', 'Galaxia',
    'Órgano', 'Parte del cuerpo', 'Emoción', 'Sentimiento', 'Virtud', 'Vicio',
    'Enfermedad', 'Medicina', 'Droga',
    'Tecnología', 'Software', 'Red social', 'Aplicación',
    'Festival', 'Fiesta', 'Tradición', 'Costumbre',
    'Lengua', 'Dialecto', 'Religión',
    'Moneda', 'Bandera', 'Símbolo',
    'Día', 'Mes', 'Estación', 'Clima', 'Fenómeno',
  ],
  en: [
    'Animal', 'Bird', 'Mammal', 'Reptile', 'Amphibian', 'Fish', 'Seafood', 'Insect', 'Spider', 'Invertebrate',
    'Tree', 'Flower', 'Plant', 'Fruit', 'Vegetable', 'Greens', 'Mushroom', 'Spice', 'Condiment', 'Seed',
    'Food', 'Drink', 'Dessert', 'Candy', 'Bread', 'Cheese', 'Sausage', 'Meat', 'Dish', 'Pastry',
    'Ice cream', 'Beer', 'Wine', 'Liquor', 'Soda',
    'First name', 'Last name', 'Profession', 'Trade', 'Job', 'Title', 'Character', 'Superhero', 'Hero', 'Villain',
    'God', 'Legend', 'Author', 'Painter', 'Actor', 'Athlete', 'Musician', 'Scientist', 'Inventor', 'Writer',
    'City', 'Town', 'Country', 'Continent', 'Capital', 'Mountain', 'River', 'Lake', 'Sea', 'Island',
    'Desert', 'Forest', 'Jungle', 'Beach', 'Cave', 'Volcano', 'Port', 'Airport', 'Stadium',
    'Object', 'Tool', 'Utensil', 'Appliance', 'Furniture', 'Clothing', 'Footwear', 'Accessory', 'Jewelry',
    'Vehicle', 'Transport', 'Machine', 'Device', 'Gadget',
    'Sport', 'Game', 'Hobby', 'Pastime', 'Competition',
    'Musical instrument', 'Song', 'Band', 'Album',
    'Movie', 'Book', 'Novel', 'Story',
    'Brand', 'Company', 'Product',
    'Color', 'Shape', 'Material', 'Metal', 'Rock', 'Mineral', 'Gem',
    'Planet', 'Star', 'Constellation', 'Galaxy',
    'Organ', 'Body part', 'Emotion', 'Feeling', 'Virtue', 'Vice',
    'Disease', 'Medicine', 'Drug',
    'Technology', 'Software', 'Social network', 'App',
    'Festival', 'Party', 'Tradition', 'Custom',
    'Language', 'Dialect', 'Religion',
    'Currency', 'Flag', 'Symbol',
    'Day', 'Month', 'Season', 'Weather', 'Phenomenon',
  ],
  fr: [
    'Animal', 'Oiseau', 'Mammifère', 'Reptile', 'Amphibien', 'Poisson', 'Fruit de mer', 'Insecte', 'Arachnide', 'Invertébré',
    'Arbre', 'Fleur', 'Plante', 'Fruit', 'Légume', 'Feuillage', 'Champignon', 'Épice', 'Condiment', 'Graine',
    'Nourriture', 'Boisson', 'Dessert', 'Bonbon', 'Pain', 'Fromage', 'Charcuterie', 'Viande', 'Plat', 'Pâtisserie',
    'Glace', 'Bière', 'Vin', 'Liquor', 'Soda',
    'Prénom', 'Nom', 'Profession', 'Métier', 'Emploi', 'Titre', 'Personnage', 'Super-héros', 'Héros', 'Vilain',
    'Dieu', 'Légende', 'Auteur', 'Peintre', 'Acteur', 'Athlète', 'Musicien', 'Scientifique', 'Inventeur', 'Écrivain',
    'Ville', 'Village', 'Pays', 'Continent', 'Capitale', 'Montagne', 'Rivière', 'Lac', 'Mer', 'Île',
    'Désert', 'Forêt', 'Jungle', 'Plage', 'Grotte', 'Volcan', 'Port', 'Aéroport', 'Stade',
    'Objet', 'Outil', 'Ustensile', 'Électroménager', 'Meuble', 'Vêtement', 'Chaussure', 'Accessoire', 'Bijou',
    'Véhicule', 'Transport', 'Machine', 'Appareil', 'Gadget',
    'Sport', 'Jeu', 'Hobby', 'Loisir', 'Compétition',
    'Instrument de musique', 'Chanson', 'Groupe', 'Album',
    'Film', 'Livre', 'Roman', 'Conte',
    'Marque', 'Entreprise', 'Produit',
    'Couleur', 'Forme', 'Matériau', 'Métal', 'Roche', 'Minéral', 'Gemme',
    'Planète', 'Étoile', 'Constellation', 'Galaxie',
    'Organe', 'Partie du corps', 'Émotion', 'Sentiment', 'Vertu', 'Vice',
    'Maladie', 'Médecine', 'Drogue',
    'Technologie', 'Logiciel', 'Réseau social', 'Application',
    'Festival', 'Fête', 'Tradition', 'Coutume',
    'Langue', 'Dialecte', 'Religion',
    'Monnaie', 'Drapeau', 'Symbole',
    'Jour', 'Mois', 'Saison', 'Météo', 'Phénomène',
  ],
  ca: [
    'Animal', 'Ocell', 'Mamífer', 'Rèptil', 'Anfibi', 'Peix', 'Marisc', 'Insecte', 'Aràcnid', 'Invertebrat',
    'Arbre', 'Flor', 'Planta', 'Fruit', 'Verdura', 'Fulla', 'Bolet', 'Espècia', 'Condiment', 'Llavor',
    'Menjar', 'Beguda', 'Postre', 'Dolç', 'Pa', 'Formatge', 'Embutit', 'Carn', 'Plat', 'Bolleria',
    'Gelat', 'Cervesa', 'Vi', 'Licor', 'Refresc',
    'Nom', 'Cognom', 'Professió', 'Ofici', 'Treball', 'Títol', 'Personatge', 'Superheroi', 'Heroi', 'Vilà',
    'Déu', 'Llegenda', 'Autor', 'Pintor', 'Actor', 'Esportista', 'Músic', 'Científic', 'Inventor', 'Escriptor',
    'Ciutat', 'Poble', 'País', 'Continente', 'Capital', 'Muntanya', 'Riu', 'Llac', 'Mar', 'Illa',
    'Desert', 'Bosc', 'Selva', 'Platja', 'Cova', 'Volcà', 'Port', 'Aeroport', 'Estadi',
    'Objecte', 'Eina', 'Utenili', 'Electrodomèstic', 'Mobili', 'Roba', 'Calçat', 'Accessorio', 'Joia',
    'Vehicle', 'Transport', 'Màquina', 'Aparell', 'Gadget',
    'Esport', 'Joc', 'Hobby', 'Passatemps', 'Competició',
    'Instrument musical', 'Cançó', 'Banda', 'Àlbum',
    'Pel·lícula', 'Llibre', 'Novel·la', 'Conte',
    'Marca', 'Empresa', 'Producte',
    'Color', 'Forma', 'Material', 'Metall', 'Roca', 'Mineral', 'Gema',
    'Planeta', 'Estrella', 'Constel·lació', 'Galàxia',
    'Òrgan', 'Part del cos', 'Emoció', 'Sentiment', 'Virtut', 'Vici',
    'Malaltia', 'Medicina', 'Droga',
    'Tecnologia', 'Programari', 'Xarxa social', 'Aplicació',
    'Festival', 'Festa', 'Tradició', 'Costum',
    'Llengua', 'Dialecte', 'Religió',
    'Moneda', 'Bandera', 'Símbol',
    'Dia', 'Mes', 'Estació', 'Clima', 'Fenomen',
  ],
};

export interface GameSettings {
  categories: string[]; // pool de categorías de la partida
  categoriesPerRound: number; // cuántas del pool salen en cada ronda
  rounds: number;
  timeLimit: number; // segundos
  language: Language;
  pointsUnique: number;
  pointsShared: number;
}

export const DEFAULT_SETTINGS: GameSettings = {
  categories: DEFAULT_CATEGORIES.es,
  categoriesPerRound: 10,
  rounds: 3,
  timeLimit: 60,
  language: 'es',
  pointsUnique: 10,
  pointsShared: 5,
};

export type Phase =
  | 'lobby'
  | 'configuring'
  | 'round_start'
  | 'playing'
  | 'validating'
  | 'results'
  | 'finished';

export type AnswerStatus = 'pending' | 'valid' | 'invalid' | 'uncertain' | 'disputed';
export type DecidedBy = 'ai' | 'player' | 'system';

export interface AnswerState {
  id: string;
  playerId: string;
  category: string;
  raw: string;
  normalized: string;
  status: AnswerStatus;
  confidence: number | null;
  reason: string | null;
  decidedBy: DecidedBy | null;
  points: number;
}

export interface PlayerState {
  id: string;
  name: string;
  isHost: boolean;
  connected: boolean;
  score: number;
}

export interface RoundState {
  index: number;
  letter: string;
  categories: string[]; // categorías activas de esta ronda (subconjunto del pool)
  letterVotes: string[]; // IDs de jugadores que votaron por cambiar la letra
  startedAt: number;
  endsAt: number;
  revealMs: number;
  endedBy: 'pencil_down' | 'timeout' | null;
  endedByPlayerId: string | null;
  answers: AnswerState[];
}

export interface AiStatus {
  available: boolean | null;
  model: string | null;
  error: string | null;
}

export interface GameState {
  code: string;
  phase: Phase;
  settings: GameSettings;
  players: PlayerState[];
  round: RoundState | null;
  createdAt: number;
  updatedAt: number;
  aiStatus: AiStatus;
}

/* ----------------------------- Protocolo WS ----------------------------- */

export type C2SMessage =
  | { t: 'hello'; code: string; playerId: string; name: string }
  | { t: 'create'; name: string; settings: Partial<GameSettings> }
  | { t: 'join'; code: string; name: string }
  | { t: 'open_config' }
  | { t: 'close_config' }
  | { t: 'update_settings'; settings: Partial<GameSettings> }
  | { t: 'start' }
  | { t: 'answer'; category: string; text: string }
  | { t: 'vote_letter' }
  | { t: 'pencil_down' }
  | { t: 'dispute'; answerId: string }
  | { t: 'resolve'; answerId: string; valid: boolean }
  | { t: 'next_round' }
  | { t: 'restart' }
  | { t: 'leave' };

export type S2CMessage =
  | { t: 'joined'; playerId: string; game: GameState; serverNow: number }
  | { t: 'state'; game: GameState; serverNow: number }
  | { t: 'event'; kind: 'pencil_down' | 'round_started' | 'round_ended' | 'ai_validating' | 'ai_done' | 'ai_unavailable'; payload?: Record<string, unknown> }
  | { t: 'ai_status'; status: AiStatus }
  | { t: 'error'; code: string; message: string };

export const MAX_NAME_LEN = 24;
export const MAX_ANSWER_LEN = 40;
export const MAX_CATEGORY_LEN = 30;
export const MAX_CATEGORIES = 300;
export const MIN_CATEGORIES = 3;
export const MIN_CATEGORIES_PER_ROUND = 3;
export const MAX_CATEGORIES_PER_ROUND = 30;
export const MAX_ROUNDS = 10;
export const MAX_TIME_LIMIT = 300;
export const MIN_TIME_LIMIT = 15;
