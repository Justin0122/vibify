/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export const up = async (knex) => {
    await knex.schema.createTable('users', table => {
        table.increments('id');
        table.string('user_id').notNullable().unique();
        table.text('access_token').notNullable();
        table.text('refresh_token').notNullable();
        table.string('expires_in').notNullable();
        table.string('api_token').notNullable();
        table.timestamp('created_at').defaultTo(knex.fn.now());
        table.timestamp('updated_at').defaultTo(knex.fn.now());
    });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export const down = async (knex) => {
    await knex.schema.dropTable('users');
};
