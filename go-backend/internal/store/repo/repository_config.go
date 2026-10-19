package repo

import (
	"database/sql"
	"errors"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"go-backend/internal/store/model"
)

// ─── Config Queries ──────────────────────────────────────────────────

func (r *Repository) GetConfigByName(name string) (*model.ViteConfig, error) {
	if r == nil || r.db == nil {
		return nil, errors.New("repository not initialized")
	}
	var cfg model.ViteConfig
	err := r.db.Where("name = ?", name).First(&cfg).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &cfg, nil
}

func (r *Repository) ListConfigs() (map[string]string, error) {
	if r == nil || r.db == nil {
		return nil, errors.New("repository not initialized")
	}
	var configs []model.ViteConfig
	if err := r.db.Find(&configs).Error; err != nil {
		return nil, err
	}
	result := make(map[string]string)
	for _, c := range configs {
		result[c.Name] = c.Value
	}
	return result, nil
}

func (r *Repository) GetConfigsByNames(names []string) (map[string]string, error) {
	if r == nil || r.db == nil {
		return nil, errors.New("repository not initialized")
	}
	if len(names) == 0 {
		return map[string]string{}, nil
	}
	var configs []model.ViteConfig
	if err := r.db.Select("name", "value").Where("name IN ?", names).Find(&configs).Error; err != nil {
		return nil, err
	}
	result := make(map[string]string, len(configs))
	for _, c := range configs {
		result[c.Name] = c.Value
	}
	return result, nil
}

func (r *Repository) UpsertConfig(name, value string, now int64) error {
	if r == nil || r.db == nil {
		return errors.New("repository not initialized")
	}
	return r.db.Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "name"}},
		DoUpdates: clause.AssignmentColumns([]string{"value", "time"}),
	}).Create(&model.ViteConfig{Name: name, Value: value, Time: now}).Error
}

func (r *Repository) UpsertConfigs(values map[string]string, now int64) error {
	if r == nil || r.db == nil {
		return errors.New("repository not initialized")
	}
	return r.db.Transaction(func(tx *gorm.DB) error {
		for name, value := range values {
			if err := tx.Clauses(clause.OnConflict{
				Columns:   []clause.Column{{Name: "name"}},
				DoUpdates: clause.AssignmentColumns([]string{"value", "time"}),
			}).Create(&model.ViteConfig{Name: name, Value: value, Time: now}).Error; err != nil {
				return err
			}
		}
		return nil
	})
}

// ─── Announcement Queries ────────────────────────────────────────────

func (r *Repository) GetAnnouncement() (*model.Announcement, error) {
	if r == nil || r.db == nil {
		return nil, errors.New("repository not initialized")
	}
	var ann model.Announcement
	err := r.db.Order("id DESC").First(&ann).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &ann, nil
}

func (r *Repository) UpsertAnnouncement(content string, enabled int, now int64) error {
	if r == nil || r.db == nil {
		return errors.New("repository not initialized")
	}
	var count int64
	if err := r.db.Model(&model.Announcement{}).Count(&count).Error; err != nil {
		return err
	}
	if count == 0 {
		return r.db.Create(&model.Announcement{
			Content: content, Enabled: enabled,
			CreatedTime: now, UpdatedTime: sql.NullInt64{Int64: now, Valid: true},
		}).Error
	}
	return r.db.Model(&model.Announcement{}).Where("1=1").Updates(map[string]interface{}{
		"content": content, "enabled": enabled, "updated_time": now,
	}).Error
}
