import http from './request'

export const getAlchemyRecipes = () => http.get('/alchemy/recipes')
export const getAlchemyMaterials = () => http.get('/alchemy/materials')
export const getAlchemyFurnaces = () => http.get('/alchemy/furnaces')
export const equipFurnace = (itemId) => http.post('/alchemy/furnace/equip', { item_id: itemId })
export const getAlchemyShop = () => http.get('/alchemy/shop')
export const alchemyBuy = (kind, id) => http.post('/alchemy/buy', { kind, id })
export const learnRecipe = (recipeId) => http.post('/alchemy/recipe/learn', { recipe_id: recipeId })
export const alchemyAttempt = (recipeId, ingredients) =>
  http.post('/alchemy/attempt', { recipe_id: recipeId, ingredients })
