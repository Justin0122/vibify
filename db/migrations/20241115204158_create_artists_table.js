/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export const up = async (knex) => {
    await knex.schema.createTable('artists', table => {
        table.increments('id');
        table.string('artist_id').notNullable().unique();
        table.string('name').notNullable();
    });

}
/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export const down = async (knex) => {
    await knex.schema.dropTable('artists');
};