"""activity location as controlled vocabulary

Revision ID: 7d46f36ee026
Revises: a5c94ce47e7a
Create Date: 2026-08-01 18:45:04.301552

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = '7d46f36ee026'
down_revision: Union[str, Sequence[str], None] = 'a5c94ce47e7a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


activity_location_enum = postgresql.ENUM(
    'outdoor', 'indoor_room', 'sports_hall', 'classroom', 'clubhouse',
    'dining_hall', 'field_trip', 'other',
    name='activitylocation',
)


def upgrade() -> None:
    """Upgrade schema."""
    # Existing free-text values ("בחוץ", "בחוץ בשלג", ...) can't be cast
    # to the new enum -- clear them rather than fail the migration.
    op.execute("UPDATE activities SET location = NULL")
    activity_location_enum.create(op.get_bind(), checkfirst=True)
    op.alter_column(
        'activities', 'location',
        existing_type=sa.VARCHAR(),
        type_=activity_location_enum,
        postgresql_using='location::activitylocation',
        existing_nullable=True,
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.alter_column(
        'activities', 'location',
        existing_type=activity_location_enum,
        type_=sa.VARCHAR(),
        existing_nullable=True,
    )
    activity_location_enum.drop(op.get_bind(), checkfirst=True)
